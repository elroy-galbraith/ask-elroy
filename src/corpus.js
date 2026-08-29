/* ---------- ANSWER BANK ----------
   Edit freely. Each entry:
   q  = the canonical question (shown as a suggestion chip)
   a  = the answer, in Elroy's first-person voice (HTML allowed)
   k  = extra keywords the matcher should recognise
   cat= category, used for the chip groups
------------------------------------ */
const PROFILE = {
  name: "Elroy Galbraith, Ph.D.",
  tagline: "Applied AI / ML Engineer &amp; AI Evaluation Scientist — financial ML + production LLM systems",
  email: "elroy.galbraith@gmail.com",
  linkedin: "https://www.linkedin.com/in/elroy-galbraith-27965356",
  location: "Sapporo, Japan"
};

const CATS = ["Start here","Experience","How I work","Research & service","Skills","Fit & logistics"];

const BANK = [
{cat:"Start here", q:"Who are you, in one paragraph?", k:"intro introduction summary about elevator pitch overview yourself tell me profile background snapshot bio",
a:`<p>I'm Elroy Galbraith. I build production AI systems for financial decision-making — and I build the instrument that says whether those systems can be trusted.</p>
<p>Three roles, and I state the structure openly rather than let it be discovered. <b>Data Science Team Lead at Yoii</b> (Tokyo, full time, 2022–present), where I built the LLM decision engine behind an SME underwriting platform and own the answer-quality layer of a Japanese-language support agent. <b>Chief Data Officer at Aeon Technology Solutions</b> (part time, and my own startup, 2023–present), where I own the data and AI stack behind stock-exchange filing analysis and real-estate valuation. And since August 2026, <b>elected Vice Chair of the Research Committee at the Jamaica AI Association</b> — voluntary, with a remit to design and execute AI research and mentor the interns who run it.</p>
<p>I hold a Ph.D. in Information Science and Technology from Hokkaido University, with earlier training in economics and complex systems, and I keep a live research record: 11 works, 52 citations, h-index 5, first or sole author on seven.</p>
<p>My edge is the intersection of financial ML and applied GenAI — credit scoring, underwriting, valuation, paired with agentic LLM systems and the evaluation science that says whether either one works. Few people sit credibly in both.</p>`},

{cat:"Start here", q:"What makes you different from other ML engineers?", k:"differentiator unique edge stand out special why hire you strength best at superpower evaluation scientist",
a:`<p>Most engineers who build LLM systems stop at "it works on the demos." I build the second system: the instrument that measures whether the first one can be trusted.</p>
<ul>
<li>Persona-driven multi-turn simulation of real users.</li>
<li>LLM-as-judge, calibrated against human labels rather than assumed correct.</li>
<li>Noise-floor measurement, so we know which result deltas are real and which are noise.</li>
<li>Cost governance, so evaluation does not become the expensive part.</li>
</ul>
<p>And when the instrument returns an unflattering result, I publish it. Two of my four major projects carry negative findings I reported against systems I built myself, and both times the roadmap changed because of it.</p>
<p>The research record says the same thing in peer-facing form: 11 works, 52 citations, h-index 5, first or sole author on seven — including a sole-authored 2026 preprint on streaming retrieval that reports its own effect size as modest and decomposes its headline number rather than quoting the flattering aggregate. That combination — building the system, holding it accountable, and publishing the result either way — is the rare part of my profile.</p>`},

{cat:"Start here", q:"What kind of role are you looking for?", k:"looking for want seeking ideal next role target position type fit desired opportunity hand off handoff hands over handover after building",
a:`<p>Deep technical ownership, still hands-on. Senior individual-contributor, applied-research, or architect shape — the seat where I own the architecture, not just one component.</p>
<p>The three things that matter to me:</p>
<ul>
<li><b>Real R&amp;D</b>, not a small research veneer on a delivery business.</li>
<li><b>A productionization team downstream</b>, so I am not the person carrying every build through polish and maintenance forever.</li>
<li><b>Where research and deployment actually meet</b> — financial ML with a research edge.</li>
</ul>
<p>I am strongest from 0 to 1: taking a hard problem from "can this even work" to a working system and a blueprint, then handing a solid foundation to a team that scales it.</p>`},

{cat:"Start here", q:"What is the one question you ask every employer?", k:"filter question non-negotiable deal breaker ask us interview them criteria what do you ask dealbreaker dealbreakers breaker handoff",
a:`<p>"When I build something that works, who owns taking it to production and maintaining it long-term?"</p>
<p>If the honest answer is "you, indefinitely," it is not my seat. I do my best work proving the hard thing and handing over a solid foundation. Polishing one system against incremental requirements forever drains me — and it is someone else's genuine strength, which should be respected and staffed for.</p>
<p>I ask it early, and I would rather hear an inconvenient answer in week one than in year one.</p>`},

/* ---------------- EXPERIENCE ---------------- */

{cat:"Experience", q:"What do you do at Yoii?", k:"yoii current job now present employer role tokyo what are you working on today day to day currently today right now doing lately these days",
a:`<p>Yoii is a Tokyo fintech doing revenue-based financing for Japanese SMEs. I joined in 2022; my title is Data Science Team Lead and this is my full-time role. My day-to-day is hands-on building.</p>
<p>Two systems are mine:</p>
<ul>
<li><b>ODIN</b> (2025–2026) — the underwriting decision engine. An agent pipeline that reads applicant documents, extracts and enriches the data, runs financial analysis and risk scoring, and produces an APPROVE / REJECT / MANUAL_REVIEW recommendation with a written rationale for a human examiner. I also built the evaluation infrastructure that measures it, and published the unflattering result it returned.</li>
<li><b>A Japanese-language customer-support agent</b> (November 2025 – present) — a production LLM agent on live chat and email. I own the answer-quality layer: retrieval architecture, knowledge-base pipeline, and evaluation.</li>
</ul>
<p>On the underwriting codebase I am a top-2 contributor with roughly 1,100 commits, out of 158 contributors.</p>`},

{cat:"Experience", q:"Tell me about the underwriting decision engine (ODIN).", k:"odin underwriting credit decision engine lending rbf revenue based financing loan approve reject agent pipeline dspy",
a:`<p>ODIN decides on real credit applications for real money, so every part of it is built to be auditable.</p>
<p><b>The system.</b> Three phases. Phase 1 runs nine data-collection services concurrently — document ingest, OCR and LLM vision extraction, web research, corporate-registry enrichment. Phase 2 runs three LLM summarizers. Phase 3 runs the decision agent, which produces the recommendation and the rationale a human examiner reads.</p>
<p><b>What I built.</b> The funding-decision agent itself; the data synthesizer that feeds it; a completeness gate that downgrades a decision when the underlying data is thin; and a deterministic knockout-factor path kept strictly separate from generated text, so rule-based rejections are grounded by construction rather than by hope. Six prompt iterations are maintained as standalone versioned modules, so any historical decision can still be replayed exactly.</p>
<p><b>An alternative I prototyped and measured rather than argued about.</b> An advocate / skeptic / judge debate architecture, built by subclassing the production module so the output contract stayed identical and any metric delta was attributable to the debate structure alone. It ran through an offline shadow-replay job entirely off the live decision path — idempotent per decision and engine, recording the resolved model, prompt version and git SHA so replays weeks apart stay comparable.</p>
<p><b>Also mine on this platform.</b> The examiner-facing React UI, the workflow orchestrator service (HMAC-authenticated, consumed from a peered VPC), the Postgres↔Snowflake sync, and the Terraform for dev and prod.</p>
<p><b>Stack.</b> Python/FastAPI, DSPy, Postgres and Snowflake, React/TypeScript, Prefect, Terraform on AWS ECS, Langfuse for tracing, GitHub Actions for CI.</p>`},

{cat:"Experience", q:"How did you evaluate the underwriting engine?", k:"evaluation eval harness golden set benchmark measure testing odin noise floor calibration ab test rigor",
a:`<p>I built eight golden-set evaluation suites on a shared harness — one for the decision agent and seven for the document-extraction paths — with frozen-input replay, a variant-agnostic A/B runner, human draft-then-approve labeling, and a tracing platform as the canonical label store. Results are versioned by git SHA so regressions are traceable. 2,118 tests gate CI.</p>
<p>Calibration is two-tier by design: reference-free proxy scorers calibrated against human-labeled truth, then reported as sensitivity, false-alarm rate and alarm precision — never collapsed into a single accuracy number that hides which way the errors go.</p>
<p>Then I established that the evaluation itself could not be trusted, and fixed it:</p>
<ul>
<li><b>Stale cache.</b> The harness was scoring cached replays as fresh inference. A reported three correct approvals reproduced as one, zero, one with caching off. Cache-off became the default in the replay path.</li>
<li><b>Noise floor.</b> I measured roughly 13 points of run-to-run variance on the hard-case subset with nothing changed — independently matching a separate audit's estimate. That proved single-run prompt A/Bs could not resolve any plausible effect size. The harness moved to repeat-run mean ± sigma with an automatic "within noise" flag on every reported delta.</li>
<li><b>Construct validity.</b> The headline metric gave half credit for "review" verdicts. A candidate prompt that approved nothing and hedged 71% of cases scored higher than production. I added a strict no-half-credit metric and made the confusion matrix the lead number.</li>
</ul>
<p>A metric that flatters you is worse than no metric, because you act on it.</p>`},

{cat:"Experience", q:"Give me an example of a negative result you published.", k:"negative result honest failure bad news unflattering wrong admit mistake killed project redirect roadmap integrity admitted admit own feature killed cancelled",
a:`<p>Two, both against my own work.</p>
<p><b>Underwriting.</b> Once the harness was honest, I benchmarked the production decision agent against a trivial always-reject baseline. It did not beat it. The system was not under-informed; it was systematically over-conservative. I published that, and a dependent workstream was redirected off a target the measurement showed was unreachable.</p>
<p><b>Support agent.</b> I had shipped a multi-topic clarification feature myself. Across 162 evaluated conversations it activated zero times. I documented it as functionally untested rather than let a good aggregate score imply the feature worked. In the same programme, the intuitive competing proposal — simply expanding the FAQ corpus — regressed four of five quality dimensions, so we did not ship it.</p>
<p>None of these were comfortable. All three saved engineering months.</p>`},

{cat:"Experience", q:"Tell me about the customer-support agent.", k:"support agent customer service chatbot japanese hubspot bedrock claude retrieval knowledge base rag",
a:`<p>A Japanese-language support agent running on HubSpot live chat and email, built on Claude via Amazon Bedrock, from November 2025. Two-engineer team: I owned the AI layer — retrieval architecture, knowledge-base pipeline, and evaluation — while my colleague owned serverless infrastructure and channel integration.</p>
<ul>
<li><b>Found the gaps empirically.</b> I ingested and PII-redacted 9,073 support email threads across 365 days, filtered to 1,075 substantive threads, and clustered them into five customer-journey stages. That decided where engineering effort went, and produced the held-out test cases every later experiment used.</li>
<li><b>Replaced a flat prompt-injected FAQ with agentic per-domain retrieval</b> — a bounded tool-use loop over ten topical knowledge-base documents, each following a strict contract: Canonical Answers / Gotchas — Don't Say / Escalate When. On held-out hard cases the piloted categories went from 1 of 6 to 6 of 6, with no new false answers.</li>
<li><b>Result.</b> Measured answer accuracy rose from 92.8% to 95.7% on a 138-case suite, and false escalations fell from 9 to 5.</li>
<li><b>Handed control to non-engineers.</b> The knowledge base is plain markdown with an explicit escalation section, so the support team authors what the bot will and will not say without an engineering change. Rollback needs no redeploy: remove one artifact from the bundle and the retrieval tool disappears from the system prompt on the next request.</li>
<li><b>Built the pipeline that keeps the knowledge base current</b> — roughly 1,900 lines, human-in-the-loop end to end: thread distillation with nested-quote stripping, LLM classification of support versus business-development threads, FAQ candidate extraction, automated push to a review workspace for support-team approval, then merge of approved entries back into the production corpus.</li>
<li><b>Scaled the knowledge base from 2 to 10 categories against explicit safety acceptance gates.</b> Safety-critical escalation held at 95%, multi-topic handling improved from 0.20 to 0.32, bad escalations fell from 11 to 7. One gate failed, and I published it as a failed criterion with root-cause analysis rather than quietly dropping it. I also root-caused a 1-in-54 hallucination (1.9%) while explicitly declining to over-read a sample of one.</li>
</ul>
<p>The measurement side of this — the closed-set harness, the multi-turn simulation, and the judge rubric — is a separate story worth asking about on its own.</p>`},

{cat:"Experience", q:"How do you evaluate a conversational agent?", k:"llm as judge simulation persona rubric multi turn conversation evaluation judge inter rater agreement cost",
a:`<p>With a multi-turn simulation and LLM-as-Judge harness — roughly 4,500 lines — scoring each conversation on five dimensions against a nine-tag failure taxonomy.</p>
<p>It exists because the layer underneath it was not enough. That layer is a deterministic closed-set harness, roughly 740 lines covering 138 cases: 120 auto-derived from the FAQ corpus plus 18 hand-written held-out cases, with baseline snapshotting behind a five-percentage-point regression gate, per-product filtering, and parallel execution at about $0.50 a run. Necessary, and structurally blind to conversational failure modes — which is the whole reason for the harness above it.</p>
<ul>
<li><b>Three models, three roles, deliberately separated.</b> The production model as system-under-test so there is no drift; a <i>cross-vendor</i> model as the simulated user, to break same-family collusion; a third model as judge.</li>
<li><b>A judge rubric designed for inter-rater agreement over scoring resolution.</b> I replaced a 0–5 Likert scale with closed-set categorical buckets carrying per-choice behavioural anchors, made quoted evidence mandatory and enforced it at both schema and runtime, and hid the dimension weight map from the judge.</li>
<li><b>Cost governance.</b> A/B testing the user-simulator model cut evaluation cost 75% with no measured quality loss, landing sustained cost at 5 to 13 US cents per simulated conversation under a hard per-run budget cap.</li>
<li><b>A real experiment, not a vibe check.</b> Matched-pairs three-way comparison of retrieval strategies: 18 personas × 3 seeds × 3 configurations = 162 conversations for $9.53. I recommended per-domain retrieval on the measured lift, after first establishing that deltas below a threshold fell inside the noise floor at that sample size.</li>
</ul>
<p>Every run stamps the system git SHA, publishes its reproduction command, and carries a written threats-to-validity section.</p>`},

{cat:"Experience", q:"What do you do at Aeon Technology Solutions?", k:"aeon aeontsolutions chief data officer cdo second job jse jamaica stock exchange real estate valuation",
a:`<p>Chief Data Officer since 2023 — part time, and it is my own startup, which I say up front rather than let an interviewer discover. In practice I am the architect and a working engineer on three things:</p>
<ul>
<li><b>A financial question-answering system over Jamaica Stock Exchange data</b> — users ask in natural language and get a grounded, cited answer instead of digging through PDFs and spreadsheets.</li>
<li><b>The filing extraction pipeline</b> that turns regulatory PDFs into queryable financial data, with a human review stage because LLM and OCR extraction is not reliable enough to publish blind.</li>
<li><b>A real-estate valuation pipeline</b> — large-scale collection and automated cleaning feeding price estimation.</li>
</ul>
<p>I also set the data-governance standards: warehouse cost control, incremental materialization, and the modelling conventions the analytics layer follows.</p>`},

{cat:"Experience", q:"Tell me about the financial question-answering system.", k:"jse datasphere chatbot rag bigquery gemini retrieval latency citation provenance filings stock exchange",
a:`<p>Two data worlds feeding one assistant. Unstructured filings sit in object storage behind a semantic index; structured financial line items — revenue, net profit, per company per year — sit in BigQuery and are queried directly. A Gemini reasoning layer routes each question, picks the tool, and synthesizes the answer behind a FastAPI backend on Docker.</p>
<p><b>What I built, in three layers:</b></p>
<ul>
<li><b>The product.</b> The retrieval and financial-query path. Response caching plus embedding-based document selection took answer latency from about 20 seconds to about 300 milliseconds. Every answer carries provenance — the rows and sources it actually used.</li>
<li><b>Whether the product is good.</b> A second system whose only job is to interrogate the first: persona-driven multi-turn simulation, an LLM judge on a six-dimension rubric, an independently computed verdict that cross-checks the judge, and hard cost caps. I then audited that machinery itself — its cost accounting, its verdict computation, and its coverage measurement all had gaps.</li>
<li><b>Whether it stays up.</b> Load testing to find real breaking points, a timeout fix driven by profiled p99 latency rather than a guess, and closing a monitoring blind spot where the system could return server errors at the load balancer with no alarm firing.</li>
</ul>`},

{cat:"Experience", q:"Tell me about the document extraction pipeline.", k:"extraction pipeline pdf textract ocr gemini classification step functions dynamodb data quality backfill garbled eps",
a:`<p>Listed companies file annual reports, financial statements, prospectuses and quarterly reports as PDFs with no structured data behind them. The pipeline classifies each document, extracts the figures, routes them to a human review queue, and publishes approved data to the warehouse.</p>
<p><b>My work was the trust layer</b> — the answer to "does this pipeline's output stop being wrong, and how would we know if it were?"</p>
<ul>
<li>Root-caused a defect where wrapped table labels produced scrambled financial figures, then backfilled 122 already-corrupted documents across the raw store, the production store, and the warehouse.</li>
<li>Fixed ticker mislabeling that filed extracted data under the wrong stock symbol, across roughly 35 symbols.</li>
<li>Fixed a fabricated-fiscal-year bug on non-financial document types.</li>
<li>Built garbled-output heuristics that catch malformed extraction before a human reviewer ever sees it, plus anomaly detection, cross-reference checks, and staleness comparison that stop the warehouse drifting silently from source truth.</li>
</ul>
<p>I also designed a head-to-head model benchmark — two vendors on the same classification task, scored on accuracy, F1, precision and recall, cost per document, and latency, over a curated 99-document golden set stratified across seven filing types. <b>Honest scope note:</b> what I claim there is the design of the framework and the golden dataset. I am not claiming a published head-to-head result, and I will not assert one I have not verified — treat it as evidence of evaluation design, not as a finished benchmark.</p>`},

{cat:"Experience", q:"Have you found bugs nobody else caught?", k:"data quality silent failure bug found upstream monitoring blind spot corruption debugging root cause",
a:`<p>Regularly, and usually because the measurement work surfaced them rather than because monitoring fired.</p>
<p>Calibrating the underwriting evaluation exposed a set of silent data-quality failures upstream:</p>
<ul>
<li>An accounting feature store zero-filling revenue instead of nulling it when ingestion stopped — quietly decaying rolling-window features feeding the risk model.</li>
<li>A divide-by-zero inflating gross-margin features.</li>
<li>A mislabeled tax field producing systematic delinquency false positives.</li>
<li>An extraction path attributing real tax balances to the wrong tax type on dense multi-period tables — a failure the existing schema-validity scorer was structurally blind to. I built a dedicated evaluation suite that matches on tax type rather than amount, specifically so that failure class can never hide again.</li>
</ul>
<p>None of these threw an error. That is the point: the systems that hurt you are the ones that keep returning plausible numbers.</p>`},

{cat:"Experience", q:"Have you worked on anything other than AI?", k:"economist economics jamaica consumer affairs policy econometrics earlier career previous before non technical government",
a:`<p>Yes. Before Japan I was a Senior Economist at the Consumer Affairs Commission in Kingston, Jamaica, from 2013 to 2018. I led national research using econometric modelling that fed into National Consumer Policy, and ran commodity price monitoring that produced benchmarks for regulators.</p>
<p>That period is why I am comfortable in front of non-technical stakeholders and why I think about financial data as economics rather than as columns. It also shaped the habit of stating uncertainty explicitly — policy audiences punish false precision faster than engineering audiences do.</p>`},

{cat:"Experience", q:"What is your career timeline?", k:"timeline history chronological progression career path years experience total when start began how long worked",
a:`<p>In order:</p>
<ul>
<li><b>2011–2013 —</b> M.Sc., University of the West Indies. Economic modelling and social data analysis.</li>
<li><b>2013–2018 —</b> Senior Economist, Consumer Affairs Commission, Kingston, Jamaica. Econometric research feeding national consumer policy; commodity price monitoring for regulators.</li>
<li><b>2019–2022 —</b> Ph.D., Information Science and Technology, Hokkaido University, Japan. Complex systems and big-data decision-making.</li>
<li><b>2022–present —</b> Data Science Team Lead, Yoii (Tokyo). Full time. LLM decision engine for SME underwriting; Japanese-language customer-support agent.</li>
<li><b>2023–present —</b> Chief Data Officer, Aeon Technology Solutions. Part time, and my own startup. Financial question-answering over Jamaica Stock Exchange data; real-estate valuation pipeline; filing extraction.</li>
<li><b>Aug 2026–present —</b> Vice Chair, Research Committee, Jamaica AI Association. Elected, voluntary. Designing and executing AI research and R&amp;D, and mentoring interns.</li>
</ul>
<p>Five years as an economist, then a research doctorate, then hands-on AI engineering in fintech — the two threads meet in financial ML, which is where I do my best work. The concurrency is deliberate and I volunteer it before anyone asks: founding and running a data company part time while leading a data science team full time reads as capacity, not as a gap in the story.</p>`},

{cat:"Experience", q:"What is the largest team or codebase you have worked in?", k:"team size codebase scale collaboration contributors big large company",
a:`<p>The Yoii underwriting platform: a repository with 158 contributors, where I am a top-2 contributor with roughly 1,100 commits. The support-agent programme was a two-engineer team with a clean ownership split — I held the AI layer, my colleague held infrastructure and channel integration.</p>
<p>Neither is FAANG scale. What they are is full-ownership scale: I have been the person accountable for whether a system works, not one contributor to a component someone else integrates.</p>`},

/* ---------------- HOW I WORK ---------------- */

{cat:"How I work", q:"Are you an individual contributor or a manager?", k:"ic manager management lead people leadership title team lead cdo hands on coding still code",
a:`<p>My titles are leadership titles — Data Science Team Lead, Chief Data Officer — and I have mentored engineers, set standards, and run the technical direction of a function. Titles and roles are two different axes though, so let me be plain about the second one.</p>
<p>My centre of gravity is hands-on. I write the code, own the architecture, and do the measurement. I am looking for a seat with deep technical ownership rather than one where I am buried in process and never touch the system. Principal, applied-research, or architect shapes fit; pure people-management does not.</p>
<p>There is one more piece of leadership evidence I would rather offer than have dug out of me: I was <i>elected</i> Vice Chair of the Research Committee at the Jamaica AI Association in August 2026. The remit is designing and executing the research agenda and mentoring the interns who execute it. It is the growing-researchers half of leadership, at national level, without committing me to a management ladder.</p>
<p>I am happy to lead. I am not happy to stop building.</p>`},

{cat:"How I work", q:"How do you decide what to ship?", k:"decision making process methodology how do you work approach ship prioritise evidence experiment",
a:`<p>Measurement first, then the decision, then the memo.</p>
<ol>
<li><b>Find the gap empirically.</b> Mine the real corpus — support threads, historical decisions, filings — rather than reasoning from intuition about what users need.</li>
<li><b>Build the instrument before trusting it.</b> Establish the noise floor, calibrate proxy scorers against human labels, and check the metric actually measures the thing it claims to.</li>
<li><b>Run a real comparison.</b> Matched pairs, repeated seeds, an explicit effect size the design can resolve.</li>
<li><b>Write it down for a mixed audience,</b> with an explicit threats-to-validity section and a reproduction command.</li>
</ol>
<p>The discipline that matters most: reporting the result the instrument gives, including when it contradicts the thing I built and wanted to ship.</p>`},

{cat:"How I work", q:"How do you handle risk in a system that makes real decisions?", k:"safety risk guardrails hallucination grounding production caution ship carefully rollback monitor default off safe safely keep safe guardrail",
a:`<p>Build the blocking path; enable it only when the measurement earns it.</p>
<p>Concretely, on the underwriting engine I shipped per-claim groundedness scoring — checking generated free text against the source financial data — into the live pipeline in monitor-first mode, default off, pending calibration. The blocking capability existed and was not enabled, because blocking a real credit decision on an uncalibrated detector is a worse failure than not blocking.</p>
<p>The other habits: keep deterministic rules structurally separate from generated text so rule-based outcomes cannot be argued away by a model; gate thin-data cases down to human review rather than guessing; and make rollback cheap enough that it is not a decision — on the support agent, rollback is removing one file from the bundle, with no redeploy.</p>`},

{cat:"How I work", q:"How do you communicate results to non-technical people?", k:"communication stakeholders writing memo report business explain non technical cross functional documentation",
a:`<p>I write decision memos for mixed engineering and business audiences — five of them on the support-agent programme alone. Each one states the decision up front, the evidence behind it, the cost, and an explicit threats-to-validity section that says what the result does <i>not</i> establish.</p>
<p>Two rules I hold to. First, the uncomfortable number goes in the summary, not the appendix. Second, if a result falls inside the measurement noise, it gets labelled as such in the headline rather than reported as a win. Business readers can handle uncertainty; what they cannot handle is discovering it later.</p>
<p>My economics background helps here — I spent five years writing for policy audiences before I wrote for engineers.</p>`},

{cat:"How I work", q:"What are you not good at?", k:"weakness weaknesses bad at limitations gaps drain not good downside honest self aware improve",
a:`<p>Two honest ones.</p>
<p><b>Long-horizon maintenance drains me.</b> Polishing a single system against incremental requirements indefinitely is genuinely someone else's strength, and I would rather that person be hired and respected for it than pretend I will thrive doing it. This is why I ask every employer who owns production long term — it is a fit question, not a work-ethic question.</p>
<p><b>Japanese.</b> I am conversational, at JLPT N4. I work effectively in Japanese technical environments with English support, but I would not claim business-level fluency.</p>
<p>A third, more of a tendency: whenever I am close to the work I end up wanting a say in how the whole thing is designed. In the right seat that is an asset. In a narrowly scoped component role it would be friction, and I would rather say so up front.</p>`},

{cat:"How I work", q:"How would you manage your weaknesses in a role?", k:"weakness manage improve mitigate handle address compensate development growth plan hire risk mitigation self aware coping",
a:`<p>Structurally, rather than by promising to become a different person.</p>
<p><b>Long-horizon maintenance.</b> I do not try to fix this with willpower. I ask who owns production long-term in week one, so a mismatch is either avoided or known before anyone signs. Where a handover does exist, I try to make it cheap: the decision memo, the reproduction command and the blueprint get written while the work happens, not assembled afterwards.</p>
<p><b>Japanese.</b> I state the level plainly &mdash; JLPT N4, conversational &mdash; and work in environments with English support. If a role genuinely needs business-level Japanese, it is not my seat, and I would rather say that than discover it in month three.</p>
<p><b>Wanting a say in the design.</b> I raise the scope question before an offer, not after. In a seat with architectural ownership this is an asset; in a narrowly scoped component role it is friction. Naming it early is the mitigation.</p>
<p>The pattern in all three: I would rather surface a fit problem in week one than manage it quietly for a year.</p>`},

{cat:"How I work", q:"What are your soft skills?", k:"soft skills interpersonal communication collaboration teamwork mentoring leadership people culture attitude working with others emotional",
a:`<p>Three I can point at evidence for, rather than assert.</p>
<p><b>Writing for people who are not me.</b> Five decision memos on the support-agent programme alone, each stating the decision, the evidence, the cost and what the result does <i>not</i> establish. Two rules I hold to: the uncomfortable number goes in the summary rather than the appendix, and a result inside the noise gets labelled as noise in the headline. Five years writing for policy audiences before I wrote for engineers is where that came from.</p>
<p><b>Mentoring.</b> I have mentored engineers and set standards as a team lead, and the remit I was elected to at the Jamaica AI Association is explicitly the research agenda and the interns who execute it. That is the growing-people half of leadership, which I want, as distinct from the management ladder, which I do not.</p>
<p><b>Saying the inconvenient thing early.</b> I publish negative results, I report what the instrument gives even when it contradicts the system I built and wanted to ship, and I ask employers the ownership question before they ask me anything hard. It is the same habit in three settings.</p>
<p>What I would not claim: I am not the person who smooths a room. I am direct, and in the wrong culture that reads as blunt.</p>`},

/* ---------------- RESEARCH & SERVICE ---------------- */

{cat:"Research & service", q:"Do you publish or share your work?", k:"publish publication paper research arxiv writing blog conference share community papers published authored preprint journal citations h index scholar record thesis dissertation",
a:`<p>Yes, and I want a role where that stays possible. Eleven works between 2016 and 2026, 52 citations, h-index 5, i10-index 3, first or sole author on seven. Citation counts are from Google Scholar as of 18 August 2026.</p>
<p><b>Preprints — the current work.</b></p>
<ul>
<li><b>2026 —</b> <i>When Does Streaming Tool Use Help? Characterizing Tool-Intent Stabilization in Streaming Retrieval-Augmented Generation.</i> arXiv:2606.20113. Sole author. Measurement science on LLM systems, and the single item closest to what I do now — worth asking about on its own.</li>
<li><b>2025 —</b> <i>TRIDENT: A Redundant Architecture for Caribbean-Accented Emergency Speech Triage.</i> arXiv:2512.10741 [cs.CL]. First author. A three-layer dispatcher-support architecture — accent-tuned ASR, LLM clinical entity extraction, and bio-acoustic distress detection feeding a three-dimensional queue-prioritisation matrix — running fully offline on a Raspberry Pi 5 for disaster scenarios. Its own abstract states that empirical validation on Caribbean emergency calls remains future work, and I label it a preprint every time.</li>
</ul>
<p><b>Peer-reviewed journal articles.</b></p>
<ul>
<li><b>2025 —</b> Johnson, Galbraith, Gibson &amp; Coley. <i>Silent scars: interpersonal sensitivity, paranoid ideation, and hostility from adverse childhood experiences in Jamaica.</i> Frontiers in Psychology.</li>
<li><b>2023 —</b> Wang, Galbraith &amp; Convertino. <i>Algal Bloom Ties: Spreading Network Inference and Extreme Eco-Environmental Feedback.</i> Entropy. Cited by ten.</li>
<li><b>2022 —</b> Galbraith, Li, Del Rio-Vilas &amp; Convertino. <i>In.To. COVID-19 socio-epidemiological co-causality.</i> Scientific Reports (Nature Portfolio). First author — an interactive infoveillance system forecasting healthcare pressure from social-media sentiment combined with epidemiological data. Code is public.</li>
<li><b>2022 —</b> Galbraith, Frade &amp; Convertino. <i>Metabolic shifts of oceans: Summoning bacterial interactions.</i> Ecological Indicators. First author.</li>
<li><b>2021 —</b> Galbraith &amp; Convertino. <i>The Eco-Evo Mandala: Simplifying Bacterioplankton Complexity into Ecohealth Signatures.</i> Entropy. First author. Cited by ten.</li>
</ul>
<p><b>Peer-reviewed conference proceedings.</b> <i>Risky Blooms: Space-Time Chlorophyll-a Analysis and Forecasting</i> (ISCIT 2023), and <i>On Structure, Function and Services of Ocean Bacterioplankton</i> (ICCS 2020, Amsterdam — oral and proceedings, first author).</p>
<p><b>Thesis.</b> <i>Whispers in Murky Waters: Bacterioplankton Interaction Networks Underpinning Ecosystem Health.</i> Ph.D. dissertation, Hokkaido University, 2022.</p>
<p><b>Policy report.</b> McFee &amp; Galbraith (2016), <i>The Developmental Cost of Homophobia: The Case of Jamaica.</i> Cited by fifteen — my most-cited work. It is a development-economics policy report, not a peer-reviewed article, and I label it that way.</p>
<p>The published record is peer-reviewed work in inference, network reconstruction and information-theoretic signal extraction — now pointed at LLM systems. Internally, publishing is a habit rather than an event: versioned decision memos, reproduction commands, and results that stay replayable months later.</p>`},

{cat:"Research & service", q:"What is your most recent paper about?", k:"streaming rag tool use latency stabilization crag benchmark 2026 preprint sole author arxiv 2606 newest latest paper strongest speculative retrieval",
a:`<p><i>When Does Streaming Tool Use Help? Characterizing Tool-Intent Stabilization in Streaming Retrieval-Augmented Generation</i> — arXiv:2606.20113, 2026, sole author. It is the strongest single item on my record for the work I want to do next, because it is measurement science on LLM systems rather than a system paper.</p>
<p><b>The problem.</b> Streaming RAG issues a tool query in parallel with an utterance that is still being spoken, so the query is speculative. The question is when that speculative retrieval converges on answer-bearing results — the point I call tool-intent stabilization — because that is what determines how much tool latency you can hide behind the user's own speech.</p>
<p><b>What it does.</b> On the CRAG benchmark (1,371 validation questions) it measures the stabilization distribution, derives a model-agnostic bound on hideable tool latency, validates that bound against working pipelines, and identifies which query properties predict early versus late stabilization. At realistic parameters, 73.9% of queries admit substantial latency hiding. Gold evidence becomes retrievable early while lexical top-1 settles late. Entity position, not reasoning complexity, predicts stabilization timing.</p>
<p><b>Why I point to it.</b> Note what it does that a marketing-shaped paper would not. It reports its effect size for question type as statistically significant but modest. It decomposes the headline 73.9% into its sufficiency and fallback parts instead of quoting the flattering aggregate. And it derives a bound you can use before deployment rather than after. Same discipline as the product work, in peer-facing form.</p>`},

{cat:"Research & service", q:"Do you hold any research leadership roles?", k:"jamaica ai association jaia vice chair research committee elected service volunteer voluntary community outside day job besides spare time extracurricular national policy task force mentoring interns caribvoices project iris",
a:`<p>Yes. In August 2026 I was <i>elected</i> Vice Chair of the Research Committee at the Jamaica AI Association. Elected, not appointed — it is standing conferred by peers, and I say the word deliberately.</p>
<p><b>The remit is the job description I am applying for.</b> Designing and executing AI research and R&amp;D, and mentoring the interns who run it. It is the same work I want to do full time; I am currently doing it voluntarily.</p>
<p><b>The organisation is a real research body, not a networking group.</b> JAIA was formally registered in 2023, has more than 200 members, and holds representation on Jamaica's National AI Task Force, which is running the country's first national AI policy framework. Its members publish — the Jamaican Patois music-transcription ASR work (arXiv:2507.16834) is JAIA-affiliated across all four authors and built a manually transcribed 40-plus-hour Patois corpus with fine-tuned models and derived scaling laws. Named initiatives include Project IRIS, on sovereign AI reflecting Jamaica's values and priorities, and CaribVoices, on Caribbean speech datasets.</p>
<p>It converges with my own TRIDENT preprint into one research programme: Caribbean-context speech and language AI, a defensible niche rather than a generic ML profile. And it answers the leadership question without a management title — mentoring researchers is evidence I can grow a team, without committing me to a people-management ladder.</p>`},

{cat:"Research & service", q:"Can I see any of your code?", k:"open source github repo repos public code codebase portfolio inspect see look read browse anywhere link show me side projects valuation lightgbm champion challenger fin-jepa xbrl statutory declaration triage stars",
a:`<p>Some, and it matters that it is inspectable — none of the four production systems above are public, so the repositories are the only place you can read my design judgment directly rather than take my word for it.</p>
<ul>
<li><b>Automated property valuation with champion/challenger governance.</b> A LightGBM champion, a Ridge challenger and an evolved third model for residential mortgage-collateral valuation. Challengers score in shadow and disagreement is flagged for human review rather than averaged away. MAPE 7.9%, R² 0.94, about 40 ms inference. IVS 103 / RICS Red Book reports grounded in an audit ledger with LLM guardrails. FastAPI, Postgres, React, Terraform, GCP.</li>
<li><b>Statutory declaration triage</b> — built against a <i>fictional</i> integrity commission, which I state plainly so it does not read as a government contract. Two-layer screening: hard rule tripwires plus weighted risk scoring, with officer case management. The design principle is the one from the underwriting engine restated in a different domain — deterministic rules decide, AI only assists and never writes to flags, scores or determinations. Append-only audit logs; every fired flag persists its triggering rule version. Two independent builds on one principle is a conviction, not a coincidence.</li>
<li><b>fin-jepa</b> — self-supervised representation learning on SEC XBRL for distress prediction, with a pre-registered pass criterion and multi-seed variance estimation. I am holding this one back from the headline list for a specific reason: the gate result is not published yet, and I will not present a pre-registered study as evidence until I report the outcome, pass or fail.</li>
</ul>
<p><b>The honest caveat, which I would rather say than have noticed.</b> Every one of these repositories has zero stars and all were created between June and August 2026. A sharp reviewer reads a two-month burst as portfolio-building during a job search, and that reading is correct. They are evidence of design judgment, not of adoption or impact, and I will not present them as anything else.</p>`},

/* ---------------- SKILLS ---------------- */

{cat:"Skills", q:"What is your technical stack?", k:"stack tech technologies tools languages frameworks python aws experience with skills technical",
a:`<p><b>Languages and core.</b> Python (FastAPI, PyTorch, scikit-learn, LightGBM), advanced SQL, TypeScript/React.</p>
<p><b>AI and agents.</b> DSPy, agentic tool-use architectures, RAG and per-domain retrieval, LLM-as-judge evaluation, prompt versioning, Langfuse tracing. Model families: Claude on Amazon Bedrock, Gemini, and cross-vendor setups by design.</p>
<p><b>Data.</b> Postgres, Snowflake, BigQuery, dbt, Kimball / star-schema modelling, Prefect orchestration.</p>
<p><b>Infrastructure.</b> AWS (ECS, Lambda, Step Functions, S3, Textract), GCP, Terraform, Docker, GitHub Actions.</p>
<p>I care much less about which framework than about whether the system can be replayed, measured, and rolled back.</p>`},

{cat:"Skills", q:"How much financial domain knowledge do you have?", k:"finance financial domain credit risk underwriting valuation banking fintech quant economics knowledge industry",
a:`<p>Substantial, and from three directions.</p>
<ul>
<li><b>Underwriting and credit.</b> Revenue-based financing decisions for Japanese SMEs — knockout factors, completeness gating, risk scoring, cashflow simulation, and examiner workflow.</li>
<li><b>Financial statements.</b> Extracting and validating line items from regulatory filings — and, more usefully, knowing the ways extraction quietly goes wrong on real statements.</li>
<li><b>Economics training.</b> A master's in economic development and five years as a Senior Economist doing econometric modelling for national policy.</li>
</ul>
<p>I am not a quant in the derivatives-pricing sense, and I would not claim to be.</p>`},

{cat:"Skills", q:"What is your education?", k:"education degree phd doctorate university study academic masters msc hokkaido qualification",
a:`<ul>
<li><b>Ph.D., Information Science and Technology</b> — Hokkaido University, Japan, 2019–2022. Specialised in complex systems and big-data decision-making. Dissertation: <i>Whispers in Murky Waters: Bacterioplankton Interaction Networks Underpinning Ecosystem Health</i> — network reconstruction and information-theoretic signal extraction from noisy observational data.</li>
<li><b>M.Sc., Sociology (Economic Development)</b> — University of the West Indies, Jamaica, 2011–2013. Economic modelling and social data analysis.</li>
</ul>
<p>The through-line from the PhD to the work I do now is causality and measurement under uncertainty in messy systems. It is the same instinct that makes me distrust an evaluation before I trust it.</p>`},

{cat:"Skills", q:"What languages do you speak?", k:"language languages english japanese jlpt nihongo bilingual fluent speak communication",
a:`<p>English is native. Japanese is conversational, JLPT N4 — I am comfortable in technical environments with English support, and I have delivered production systems in a Japanese-language product context, including a Japanese-language support agent.</p>
<p>I will not overstate this: business-level Japanese negotiation is not yet my strength, and if a role needs it I would rather you know now.</p>`},

{cat:"Skills", q:"Do you have LLM production experience, or just prototypes?", k:"production llm genai real users live deployed prototype poc scale reliability experience shipping built projects works portfolio achievements notable",
a:`<p>Production, with real consequences attached.</p>
<ul>
<li>An LLM decision engine that produces recommendations on live credit applications, reviewed by a credit and risk team.</li>
<li>A Japanese-language support agent answering real customers on live chat and email.</li>
<li>A financial question-answering system serving stock-exchange data with cited provenance, load-tested and monitored.</li>
</ul>
<p>All three carry the unglamorous parts: CI gates, tracing, cost caps, rollback paths, monitoring, and replayable prompt versioning. Prototypes are the easy half. None of the three is public, though, which is a real limit on what you can verify from outside — if you want something you can read rather than take on trust, ask about my open-source repositories instead.</p>`},

/* ---------------- FIT & LOGISTICS ---------------- */

{cat:"Fit & logistics", q:"Where are you based, and will you relocate?", k:"location where live based relocate relocation move city country japan sapporo tokyo remote onsite",
a:`<p>I am based in Sapporo, Japan. My full-time role is with a Tokyo company, so I already work at distance from the office. I am open to relocating internationally for the right role, and open to hybrid arrangements.</p>
<p>What I want from the arrangement: hybrid, within reach of a major city, and stable enough outside work that I show up with real energy inside it. Fully remote is workable; fully on-site five days a week in a distant city is a harder conversation, not an impossible one.</p>`},

{cat:"Fit & logistics", q:"What is your work-authorization situation?", k:"visa sponsorship work permit authorization immigration eligible legally authorised right to work green card lmia gts",
a:`<p>Plainly: I currently live and work in Japan. For a role in any other country I will need visa sponsorship.</p>
<p>Two things worth knowing before that becomes a reason to stop reading:</p>
<ul>
<li><b>My profile fits the fast routes.</b> A Ph.D., senior technical experience, and an in-demand occupation are what most skilled-worker and fast-track programmes are built for. With an employer who has sponsored before, this is usually weeks of paperwork rather than an open-ended risk.</li>
<li><b>The recognition-based routes have something to work with.</b> A published research record and a named national-level position — elected Vice Chair of the Jamaica AI Association's Research Committee — are the kind of evidence recognition-based routes such as Canada's Global Talent Stream weigh. I am not an immigration lawyer and I would not present that as legal advice; it is a reason for the conversation to be short rather than long.</li>
<li><b>I am pursuing offer-independent routes in parallel.</b> Several countries have points-based skilled-migration paths my qualifications may satisfy without a job offer. If one lands, sponsorship stops being a dependency at all.</li>
</ul>
<p>Tell me the country and I will be specific about the route on a call.</p>`},

{cat:"Fit & logistics", q:"What are your salary expectations?", k:"salary compensation pay money package rate expectations comp band worth cost how much",
a:`<p>I discuss compensation in a conversation, not through a chatbot — the number depends on the market, the level, and what the role actually is.</p>
<p>What I will say up front: I have a clear and researched view of my market rate, and I optimise for role fit over the top of the band. I have deliberately decided against chasing a higher number into a seat I would resent. That is a considered trade-off, not a lack of ambition.</p>
<p>Ask me directly and you will get a straight answer.</p>`},

{cat:"Fit & logistics", q:"Why are you looking to move?", k:"why leave leaving move motivation change jobs unhappy reason switching push",
a:`<p>Not unhappiness — direction.</p>
<p>I have taken two production AI systems from nothing to working, and built the evaluation infrastructure that holds them accountable. What I want next is that same work with more room: a seat where real research and real deployment meet, with a productionization team downstream so my time goes into the hard 0-to-1 problems rather than into carrying every system through maintenance indefinitely.</p>
<p>I am also looking for scope without losing the craft — deep technical ownership, still hands-on — and a setting where publishing what I learn is normal rather than tolerated.</p>`},

{cat:"Fit & logistics", q:"Where do you see yourself in five years?", k:"five years future career goals ambition long term plan trajectory growth aspire",
a:`<p>Owning the technical direction of how AI gets built somewhere — designing the architecture, proving out the hard problems, then handing a solid foundation to a team that scales it. I am strongest at 0-to-1: from "can this work" to "here is the working system and the blueprint."</p>
<p>So: a principal or applied-research seat. Deep technical ownership, still hands-on, paired with a team that carries things into production.</p>
<p>And outside work — settled, hybrid, present for my family. That is not incidental. It is what makes the energy inside work sustainable.</p>`},

{cat:"Fit & logistics", q:"What kind of company suits you?", k:"company culture environment startup enterprise team fit prefer type organisation size",
a:`<p>Somewhere R&amp;D is real rather than a small research veneer on a delivery business, and where my seat sits on the build-and-research side rather than being deployed as billable delivery headcount.</p>
<p>Beyond that I am flexible on size. I have worked in Japanese startups where I owned everything, and I would work happily in a large organisation's research group. The structural question matters more than the logo: is there a team downstream that takes production ownership, and is there room to publish?</p>`},

{cat:"Fit & logistics", q:"Would you be better suited to a small, medium or large company?", k:"small large medium company size startup scaleup enterprise corporate firm headcount big small team suited better fit",
a:`<p>Size is the wrong axis, and I would rather answer the right one &mdash; but here is the honest version of both.</p>
<p>I have done small: Japanese startups where I owned everything end to end. I would work happily inside a large organisation's research group. What decides it is not headcount but two structural things: is there a team downstream that takes production ownership, and is there room to publish.</p>
<p>Which means the risk runs in a specific direction. A small firm is where I am most likely to become the permanent maintainer of everything I build, because there is nobody downstream &mdash; and that is my stated dealbreaker, not a preference. A large firm fails differently: research that is a veneer on a delivery business, or a seat that turns out to be billable delivery headcount.</p>
<p>So: any size where the handover exists and the research is real. No size where it does not.</p>`},

{cat:"Fit & logistics", q:"When could you start?", k:"start date availability notice period available when begin timeline join",
a:`<p>Timing depends on notice and, for a role outside Japan, on the visa route — which is worth mapping early rather than at offer stage.</p>
<p>I would rather give you a real date once we know which country and which route than a number that turns out to be wrong. Email me and I will be specific.</p>`},

{cat:"Fit & logistics", q:"How do I contact you?", k:"contact email reach linkedin get in touch hire apply talk call schedule resume cv",
a:`<p>Email is best: <a href="mailto:elroy.galbraith@gmail.com">elroy.galbraith@gmail.com</a></p>
<p>LinkedIn: <a href="https://www.linkedin.com/in/elroy-galbraith-27965356" target="_blank" rel="noopener">linkedin.com/in/elroy-galbraith-27965356</a></p>
<p>Ask by email for my CV or phone number and I will send them. If you have a role in mind, include the answer to one question and you will get a fast reply: <i>who owns taking a working system to production and maintaining it long-term?</i></p>`},

{cat:"Fit & logistics", q:"Are you a real person or is this an AI?", k:"real ai bot chatbot who built this human are you elroy fake generated automated how does this work",
a:`<p>I am a real person; this page is not me. It is a small assistant Elroy built using a language model constrained to passages he wrote and approved. The model can rephrase and cite those passages, but it cannot add facts, invent a job, or state anything not already written there.</p>
<p>That constraint is deliberate. He builds evaluation systems for LLM products for a living, which is a good reason not to point an ungoverned one at his own reputation.</p>
<p>If the answer you need is not here, email him: <a href="mailto:elroy.galbraith@gmail.com">elroy.galbraith@gmail.com</a></p>`}
];
