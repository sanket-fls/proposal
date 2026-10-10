# Demo script (~2 minutes)

**Setup before you go up**
- `npm start` running, tunnel up, ChatGPT connector refreshed with the current tunnel URL.
- Tab 1: ChatGPT, new chat, connector enabled, sample brief on the clipboard.
- Tab 2: `http://localhost:8787` — the standalone engine page (works with no network; the "Diagnostic lab chain" sample is preloaded).
- Tab 3: backup video.
- Run the whole flow once, ten minutes before, so nothing is cold.

---

### Problem (15s)
> "Every agency writes hundreds of proposals a year. Each one takes a senior person half a day, and the price is still a guess. The data that would make it accurate — what similar projects actually took — is sitting in old timesheets nobody opens. So quotes are late, and wrong in the expensive direction."

### Live demo (80s)

**Paste the brief**
> "This is a brief from a diagnostic lab chain: 3,000 patient queries a day, a 60-page SOP, they want an AI assistant live in three months. Watch what the engine does with it."

Click **Run the engine** (or in ChatGPT: *"Build a proposal for this brief:"* + paste).

**Narrate the stages as they light up** (the progress bar at the top and the stage HUD bottom-left show each step with its time)
> "It pulls out six requirements and shows exactly which words each came from — and which ones the client didn't ask for but will need."
> "It finds the five most similar projects we've delivered — same industry first — and their actual hours, not estimates."
> "Every hour is a P50 and P90 from those actuals. Integration work overran 42% historically — that's already in the number."
> "Timeline, three options, and the thing nobody puts in a proposal: the risks. The deadline is tighter than the evidence. 'Eventually' and 'simple' are in the brief — those words cost money. Here's the question to ask."
> "And the proposal writes itself from the computed plan — the model can't invent a number because it never gets to."

**Finish**
> "Nine seconds. Every figure clickable back to the project it came from."

Click **evidence** under one estimate to show the source components. Click **Open proposal, save as PDF**.

*Recovery lines*
- Tool not called in ChatGPT → "Let me be explicit" → send `Use the proposal engine on that brief.`
- ChatGPT slow / widget blank → switch to Tab 2, click **Run the engine**. "Same engine, running locally."
- Anything else → Tab 3 video: "Wi-Fi's fighting me — here's the run from this morning."

### How OpenAI is used (15s)
> "Built on the Apps SDK: an MCP tool returns the full engine run and the widget replays it inside ChatGPT. The Responses API does the reading with structured outputs and the writing with streaming; embeddings do the matching. Everything with a currency sign is deterministic code over real delivery data. The model does judgement, the code does arithmetic."

---

**Backup video:** record a full run (brief → rail lighting up → options counting → PDF) as soon as it works at the venue.
