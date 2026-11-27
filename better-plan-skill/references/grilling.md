<!-- Adapted from mattpocock/skills skills/productivity/grilling (MIT). See THIRD_PARTY_NOTICES.md. -->

# Grilling

Interview the user relentlessly until you reach a shared understanding. Map this as a **design
tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every question whose prerequisites are already
settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the
whole frontier in one round, each question with numbered options and your recommended answer
pre-filled. Then wait for the user's answers before the next round.

Every round is asked in the chat, never spread across files or a to-do list. Each question carries
2–5 clickable-in-prose options and exactly one recommended option, so the user settles a question
with one word ("Q2A") or accepts the whole batch with "all recommended" / "全部按推荐".

Each round the user answers reshapes the tree: settled answers push the frontier outward and unblock
questions that depended on them. Recompute the frontier and ask the next round. A question whose
answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the
environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it;
don't ask the user for anything you could look up yourself. Don't block on it: a running exploration
is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to
report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left
silently assumed. Do not act on it until the user has settled every question.
