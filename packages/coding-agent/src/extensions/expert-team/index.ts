/**
 * Expert team extension.
 *
 * Runs one independent model conversation per expert persona in parallel, then a
 * moderator call merges the answers into a synthesis. Each consult produces a run;
 * runs persist as custom session entries (branching-correct) and are viewable with
 * `/experts` without arguments.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { ExpertTranscriptViewer } from "./viewer.ts";

interface Expert {
	name: string;
	persona: string;
}

interface ExpertAnswer {
	expert: string;
	text: string;
}

interface ExpertRun {
	question: string;
	answers: ExpertAnswer[];
	synthesis: string;
	timestamp: number;
}

const DEFAULT_EXPERTS: Expert[] = [
	{
		name: "Architect",
		persona:
			"You are a senior software architect. Analyze the question from a system-design perspective: structure, boundaries, trade-offs, and long-term maintenance cost. Be concrete and concise. Answer in the language of the question.",
	},
	{
		name: "Skeptic",
		persona:
			"You are a rigorous reviewer. Challenge the premise of the question, point out flaws, risks, and edge cases others would miss. If the question is already fine, say so and explain why. Be concrete and concise. Answer in the language of the question.",
	},
	{
		name: "Implementer",
		persona:
			"You are a hands-on engineer. Answer from implementation reality: concrete steps, small examples, effort estimates, and what usually breaks in practice. Be concrete and concise. Answer in the language of the question.",
	},
];

const MODERATOR_PERSONA =
	"You are a moderator. You receive a question and independent answers from a panel of experts. Merge them into one answer: keep points that survive scrutiny, drop duplicated ones, note genuine disagreements. Answer in the language of the question.";

const ENTRY_TYPE = "expert-team";

export default function expertTeamExtension(pi: ExtensionAPI): void {
	let runs: ExpertRun[] = [];

	const reconstructState = (ctx: ExtensionContext) => {
		runs = [];
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && (entry as { customType?: string }).customType === ENTRY_TYPE) {
				const data = (entry as { data?: ExpertRun }).data;
				if (data?.question) runs.push(data);
			}
		}
	};

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	async function consultExpert(ctx: ExtensionContext, expert: Expert, question: string): Promise<ExpertAnswer> {
		try {
			const message = await answerOnce(ctx, expert.persona, question);
			const text = message.content
				.filter((c) => c.type === "text")
				.map((c) => c.text)
				.join("\n")
				.trim();
			return { expert: expert.name, text: text || "(empty answer)" };
		} catch (error) {
			return { expert: expert.name, text: `Error: ${error instanceof Error ? error.message : String(error)}` };
		}
	}

	async function answerOnce(ctx: ExtensionContext, systemPrompt: string, prompt: string): Promise<AssistantMessage> {
		if (!ctx.model) throw new Error("No model selected");
		const stream = ctx.modelRegistry.streamSimple(
			ctx.model,
			{
				systemPrompt,
				messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
			},
			{ signal: ctx.signal },
		);
		return stream.result();
	}

	async function synthesize(ctx: ExtensionContext, question: string, answers: ExpertAnswer[]): Promise<string> {
		const transcript = answers.map((a) => `## ${a.expert}\n\n${a.text}`).join("\n\n");
		try {
			const message = await answerOnce(
				ctx,
				MODERATOR_PERSONA,
				`Question:\n${question}\n\nExpert answers:\n\n${transcript}`,
			);
			return (
				message.content
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("\n")
					.trim() || "(empty synthesis)"
			);
		} catch (error) {
			return `Error: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async function runTeam(ctx: ExtensionContext, question: string): Promise<void> {
		ctx.ui.setStatus(ENTRY_TYPE, ctx.ui.theme.fg("accent", "experts consulting..."));
		try {
			const answers = await Promise.all(DEFAULT_EXPERTS.map((expert) => consultExpert(ctx, expert, question)));
			const synthesis = await synthesize(ctx, question, answers);
			const run: ExpertRun = { question, answers, synthesis, timestamp: Date.now() };
			runs.push(run);
			pi.appendEntry(ENTRY_TYPE, run);
			pi.sendMessage(
				{ customType: "expert-team-result", content: formatRun(run), display: true },
				{ triggerTurn: false },
			);
		} finally {
			ctx.ui.setStatus(ENTRY_TYPE, undefined);
		}
	}

	async function showTranscripts(ctx: ExtensionContext): Promise<void> {
		if (runs.length === 0) {
			ctx.ui.notify("No expert team runs yet. Use /experts <question> to consult the team.", "info");
			return;
		}
		const labels = runs.map(
			(run, index) => `#${index + 1} ${run.question.slice(0, 60)}${run.question.length > 60 ? "..." : ""}`,
		);
		const selected = await ctx.ui.select("Expert team runs", labels);
		if (selected === undefined) return;
		const index = labels.indexOf(selected);
		const run = runs[index];
		if (!run) return;
		await ctx.ui.custom<void>((_tui, theme, _kb, done) => new ExpertTranscriptViewer(run, theme, done));
	}

	pi.registerCommand("experts", {
		description: "Consult the expert team, or view past transcripts without arguments",
		handler: async (args, ctx) => {
			const question = args.trim();
			if (!question) {
				if (ctx.mode !== "tui") {
					ctx.ui.notify("/experts without a question requires interactive mode", "error");
					return;
				}
				await showTranscripts(ctx);
				return;
			}
			if (!ctx.model) {
				ctx.ui.notify("No model selected. Configure a model first.", "error");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current run to finish before consulting the experts.", "error");
				return;
			}
			await runTeam(ctx, question);
		},
	});
}

function formatRun(run: ExpertRun): string {
	const sections = run.answers.map((answer) => `### ${answer.expert}\n\n${answer.text}`).join("\n\n");
	return `## Expert Team\n\n**Question:** ${run.question}\n\n${sections}\n\n### Synthesis\n\n${run.synthesis}`;
}
