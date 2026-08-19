/* ---------- ANSWER BANK ----------
   Edit freely. Each entry:
   q  = the canonical question (shown as a suggestion chip)
   a  = the answer, in Elroy's first-person voice (HTML allowed)
   k  = extra keywords the matcher should recognise
   cat= category, used for the chip groups
------------------------------------ */
const PROFILE = {
  name: "Elroy Galbraith, Ph.D.",
  tagline: "Lead AI Engineer &amp; Data Architect — financial ML + applied GenAI",
  email: "elroy.galbraith@gmail.com",
  linkedin: "https://www.linkedin.com/in/elroygalbraith",
  location: "Sapporo / Tokyo, Japan"
};

const CATS = ["Start here","Experience","How I work","Skills","Fit & logistics"];

const BANK = [
{cat:"Start here", q:"Who are you, in one paragraph?", k:"intro introduction summary about elevator pitch overview yourself tell me profile background snapshot bio",
a:`<p>I'm Elroy Galbraith. I build production AI systems for financial decision-making — and I build the measurement infrastructure that says whether those systems can be trusted.</p>
<p>Today I'm Data Science Team Lead at Yoii (Tokyo), where I built the LLM decision engine behind an SME underwriting platform, and Chief Data Officer at Aeon Technology Solutions, where I own the data and AI stack behind stock-exchange filing analysis and real-estate valuation. I hold a PhD in Information Science from Hokkaido University, with earlier training in economics and complex systems.</p>
<p>My edge is the intersection of financial ML and applied GenAI. Credit scoring, underwriting, valuation — paired with agentic and LLM systems. Few people sit credibly in both.</p>`},

{cat:"Start here", q:"What makes you different from other ML engineers?", k:"differentiator unique edge stand out special why hire you strength best at superpower evaluation scientist",
a:`<p>Most engineers who build LLM systems stop at "it works on the demos." I build the second system: the instrument that measures whether the first one can be trusted.</p>
<ul>
<li>Persona-driven multi-turn simulation of real users.</li>
<li>LLM-as-judge, calibrated against human labels rather than assumed correct.</li>
<li>Noise-floor measurement, so we know which result deltas are real and which are noise.</li>
<li>Cost governance, so evaluation does not become the expensive part.</li>
</ul>
<p>And when the instrument returns an unflattering result, I publish it. I have twice reported negative results against my own shipped work, and both times the roadmap changed because of it. That combination — building the system and holding it accountable — is the rare part of my profile.</p>`},

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
a:`<p>Yoii is a Tokyo fintech doing revenue-based financing for Japanese SMEs. My title is Data Science Team Lead; my day-to-day is hands-on building.</p>
<p>Two systems are mine:</p>
<ul>
<li><b>ODIN</b> — the underwriting decision engine. An agent pipeline that reads applicant documents, extracts and enriches the data, runs financial analysis and risk scoring, and produces an APPROVE / REJECT / MANUAL_REVIEW recommendation with a written rationale for a human examiner.</li>
<li><b>A Japanese-language customer-support agent</b> — a production LLM agent on live chat and email. I own the answer-quality layer: retrieval architecture, knowledge-base pipeline, and evaluation.</li>
</ul>
<p>On the underwriting codebase I am a top-2 contributor with roughly 1,100 commits across a 15-person repository.</p>`},

{cat:"Experience", q:"Tell me about the underwriting decision engine (ODIN).", k:"odin underwriting credit decision engine lending rbf revenue based financing loan approve reject agent pipeline dspy",
a:`<p>ODIN decides on real credit applications for real money, so every part of it is built to be auditable.</p>
<p><b>The system.</b> Three phases. Phase 1 runs nine data-collection services concurrently — document ingest, OCR and LLM vision extraction, web research, corporate-registry enrichment. Phase 2 runs three LLM summarizers. Phase 3 runs the decision agent, which produces the recommendation and the rationale a human examiner reads.</p>
<p><b>What I built.</b> The funding-decision agent itself; the data synthesizer that feeds it; a completeness gate that downgrades a decision when the underlying data is thin; and a deterministic knockout-factor path kept strictly separate from generated text, so rule-based rejections are grounded by construction rather than by hope. Six prompt iterations are maintained as standalone versioned modules, so any historical decision can still be replayed exactly.</p>
<p><b>Stack.</b> Python/FastAPI, DSPy, Postgres and Snowflake, React/TypeScript, Prefect, Terraform on AWS ECS, Langfuse for tracing, GitHub Actions for CI.</p>`},

{cat:"Experience", q:"How did you evaluate the underwriting engine?", k:"evaluation eval harness golden set benchmark measure testing odin noise floor calibration ab test rigor",
a:`<p>I built eight golden-set evaluation suites on a shared harness — one for the decision agent and seven for the document-extraction paths — with frozen-input replay, a variant-agnostic A/B runner, human draft-then-approve labeling, and a canonical label store. Results are versioned by git SHA so regressions are traceable. 2,118 tests gate CI.</p>
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
a:`<p>A Japanese-language support agent running on live chat and email, built on Claude via Amazon Bedrock. Two-engineer team: I owned the AI layer — retrieval architecture, knowledge-base pipeline, and evaluation — while my colleague owned serverless infrastructure and channel integration.</p>
<ul>
<li><b>Found the gaps empirically.</b> I ingested and PII-redacted 9,073 support email threads across 365 days, filtered to 1,075 substantive threads, and clustered them into five customer-journey stages. That decided where engineering effort went, and produced the held-out test cases every later experiment used.</li>
<li><b>Replaced a flat prompt-injected FAQ with agentic per-domain retrieval</b> — a bounded tool-use loop over ten topical knowledge-base documents, each following a strict contract: Canonical Answers / Gotchas — Don't Say / Escalate When. On held-out hard cases the piloted categories went from 1 of 6 to 6 of 6, with no new false answers.</li>
<li><b>Result.</b> Measured answer accuracy rose from 92.8% to 95.7% on a 138-case suite, and false escalations fell from 9 to 5.</li>
<li><b>Handed control to non-engineers.</b> The knowledge base is plain markdown with an explicit escalation section, so the support team authors what the bot will and will not say without an engineering change. Rollback needs no redeploy: remove one artifact from the bundle and the retrieval tool disappears from the system prompt on the next request.</li>
</ul>`},

{cat:"Experience", q:"How do you evaluate a conversational agent?", k:"llm as judge simulation persona rubric multi turn conversation evaluation judge inter rater agreement cost",
a:`<p>Closed-set question-and-answer tests are necessary and insufficient — they are blind to conversational failure modes. So I built a multi-turn simulation and LLM-as-Judge harness on top.</p>
<ul>
<li><b>Three models, three roles, deliberately separated.</b> The production model as system-under-test so there is no drift; a <i>cross-vendor</i> model as the simulated user, to break same-family collusion; a third model as judge.</li>
<li><b>A judge rubric designed for inter-rater agreement over scoring resolution.</b> I replaced a 0–5 Likert scale with closed-set categorical buckets carrying per-choice behavioural anchors, made quoted evidence mandatory and enforced it at both schema and runtime, and hid the dimension weight map from the judge.</li>
<li><b>Cost governance.</b> A/B testing the user-simulator model cut evaluation cost 75% with no measured quality loss, landing sustained cost at 5 to 13 US cents per simulated conversation under a hard per-run budget cap.</li>
<li><b>A real experiment, not a vibe check.</b> Matched-pairs three-way comparison of retrieval strategies: 18 personas × 3 seeds × 3 configurations = 162 conversations for $9.53. I recommended per-domain retrieval on the measured lift, after first establishing that deltas below a threshold fell inside the noise floor at that sample size.</li>
</ul>
<p>Every run stamps the system git SHA, publishes its reproduction command, and carries a written threats-to-validity section.</p>`},

{cat:"Experience", q:"What do you do at Aeon Technology Solutions?", k:"aeon aeontsolutions chief data officer cdo second job jse jamaica stock exchange real estate valuation",
a:`<p>Chief Data Officer. In practice I am the architect and a working engineer on three things:</p>
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
<p>I also designed a head-to-head model benchmark — two vendors on the same classification task, scored on accuracy, F1, precision and recall, cost per document, and latency, over a curated 99-document golden set stratified across seven filing types. <b>Honest caveat:</b> that framework was never run to completion. Treat it as evidence of evaluation design, not as a finished benchmark.</p>`},

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
<li><b>2022–present —</b> Data Science Team Lead, Yoii (Tokyo). LLM decision engine for SME underwriting; Japanese-language customer-support agent.</li>
<li><b>2022–present —</b> Chief Data Officer, Aeon Technology Solutions (concurrent). Financial question-answering over Jamaica Stock Exchange data; real-estate valuation pipeline; filing extraction.</li>
</ul>
<p>Five years as an economist, then a research doctorate, then hands-on AI engineering in fintech — the two threads meet in financial ML, which is where I do my best work.</p>`},

{cat:"Experience", q:"What is the largest team or codebase you have worked in?", k:"team size codebase scale collaboration contributors big large company",
a:`<p>The Yoii underwriting platform: a 15-person codebase where I am a top-2 contributor with roughly 1,100 commits. The support-agent programme was a two-engineer team with a clean ownership split — I held the AI layer, my colleague held infrastructure and channel integration.</p>
<p>Neither is FAANG scale. What they are is full-ownership scale: I have been the person accountable for whether a system works, not one contributor to a component someone else integrates.</p>`},

/* ---------------- HOW I WORK ---------------- */

{cat:"How I work", q:"Are you an individual contributor or a manager?", k:"ic manager management lead people leadership title team lead cdo hands on coding still code",
a:`<p>My titles are leadership titles — Data Science Team Lead, Chief Data Officer — and I have mentored engineers, set standards, and run the technical direction of a function. Titles and roles are two different axes though, so let me be plain about the second one.</p>
<p>My centre of gravity is hands-on. I write the code, own the architecture, and do the measurement. I am looking for a seat with deep technical ownership rather than one where I am buried in process and never touch the system. Principal, applied-research, or architect shapes fit; pure people-management does not.</p>
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

{cat:"How I work", q:"Do you publish or share your work?", k:"publish publication paper research arxiv writing blog conference open source share community papers published authored preprint journal",
a:`<p>Yes, and I want a role where that is possible.</p>
<ul>
<li><b>2025 —</b> <i>TRIDENT: A Redundant Architecture for Caribbean-Accented Emergency Speech Triage.</i> arXiv:2512.10741 [cs.CL].</li>
<li><b>2022 —</b> <i>In. To. COVID-19 socio-epidemiological co-causality.</i> Scientific Reports (Nature Portfolio).</li>
</ul>
<p>Internally, publishing is a habit rather than an event: versioned decision memos, reproduction commands, and results that stay replayable months later. Room to write and share what I learn is one of the things I look for in a role.</p>`},

/* ---------------- SKILLS ---------------- */

{cat:"Skills", q:"What is your technical stack?", k:"stack tech technologies tools languages frameworks python aws experience with skills technical",
a:`<p><b>Languages and core.</b> Python (FastAPI, PyTorch, scikit-learn), advanced SQL, TypeScript/React.</p>
<p><b>AI and agents.</b> DSPy, agentic tool-use architectures, RAG and per-domain retrieval, LLM-as-judge evaluation, prompt versioning, Langfuse tracing. Model families: Claude on Amazon Bedrock, Gemini, and cross-vendor setups by design.</p>
<p><b>Data.</b> Postgres, Snowflake, BigQuery, dbt, Kimball / star-schema modelling, Prefect orchestration.</p>
<p><b>Infrastructure.</b> AWS (ECS, Lambda, Step Functions, S3, Textract), Terraform, Docker, GitHub Actions.</p>
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
<li><b>Ph.D., Information Science and Technology</b> — Hokkaido University, Japan, 2019–2022. Specialised in complex systems and big-data decision-making.</li>
<li><b>M.Sc., Sociology (Economic Development)</b> — University of the West Indies, Jamaica, 2011–2013. Economic modelling and social data analysis.</li>
</ul>
<p>The through-line from the PhD to the work I do now is causality and measurement under uncertainty in messy systems. It is the same instinct that makes me distrust an evaluation before I trust it.</p>`},

{cat:"Skills", q:"What languages do you speak?", k:"language languages english japanese jlpt nihongo bilingual fluent speak communication",
a:`<p>English is native. Japanese is conversational, JLPT N4 — I am comfortable in technical environments with English support, and I have delivered production systems in a Japanese-language product context, including a Japanese-language support agent.</p>
<p>I will not overstate this: business-level Japanese negotiation is not yet my strength, and if a role needs it I would rather you know now.</p>`},

{cat:"Skills", q:"Do you have LLM production experience, or just prototypes?", k:"production llm genai real users live deployed prototype poc scale reliability experience shipping",
a:`<p>Production, with real consequences attached.</p>
<ul>
<li>An LLM decision engine that produces recommendations on live credit applications, reviewed by a credit and risk team.</li>
<li>A Japanese-language support agent answering real customers on live chat and email.</li>
<li>A financial question-answering system serving stock-exchange data with cited provenance, load-tested and monitored.</li>
</ul>
<p>All three carry the unglamorous parts: CI gates, tracing, cost caps, rollback paths, monitoring, and replayable prompt versioning. Prototypes are the easy half.</p>`},

/* ---------------- FIT & LOGISTICS ---------------- */

{cat:"Fit & logistics", q:"Where are you based, and will you relocate?", k:"location where live based relocate relocation move city country japan sapporo tokyo remote onsite",
a:`<p>I am based in Japan, working between Sapporo and Tokyo. I am open to relocating internationally for the right role, and open to hybrid arrangements.</p>
<p>What I want from the arrangement: hybrid, within reach of a major city, and stable enough outside work that I show up with real energy inside it. Fully remote is workable; fully on-site five days a week in a distant city is a harder conversation, not an impossible one.</p>`},

{cat:"Fit & logistics", q:"What is your work-authorization situation?", k:"visa sponsorship work permit authorization immigration eligible legally authorised right to work green card lmia gts",
a:`<p>Plainly: I currently live and work in Japan. For a role in any other country I will need visa sponsorship.</p>
<p>Two things worth knowing before that becomes a reason to stop reading:</p>
<ul>
<li><b>My profile fits the fast routes.</b> A PhD, senior technical experience, and an in-demand occupation are what most skilled-worker and fast-track programmes are built for. With an employer who has sponsored before, this is usually weeks of paperwork rather than an open-ended risk.</li>
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

{cat:"Fit & logistics", q:"When could you start?", k:"start date availability notice period available when begin timeline join",
a:`<p>Timing depends on notice and, for a role outside Japan, on the visa route — which is worth mapping early rather than at offer stage.</p>
<p>I would rather give you a real date once we know which country and which route than a number that turns out to be wrong. Email me and I will be specific.</p>`},

{cat:"Fit & logistics", q:"How do I contact you?", k:"contact email reach linkedin get in touch hire apply talk call schedule resume cv",
a:`<p>Email is best: <a href="mailto:elroy.galbraith@gmail.com">elroy.galbraith@gmail.com</a></p>
<p>LinkedIn: <a href="https://www.linkedin.com/in/elroygalbraith" target="_blank" rel="noopener">linkedin.com/in/elroygalbraith</a></p>
<p>Ask by email for my CV or phone number and I will send them. If you have a role in mind, include the answer to one question and you will get a fast reply: <i>who owns taking a working system to production and maintaining it long-term?</i></p>`},

{cat:"Fit & logistics", q:"Are you a real person or is this an AI?", k:"real ai bot chatbot who built this human are you elroy fake generated automated how does this work",
a:`<p>I am a real person; this page is not me. It is a small assistant Elroy built using a language model constrained to passages he wrote and approved. The model can rephrase and cite those passages, but it cannot add facts, invent a job, or state anything not already written there.</p>
<p>That constraint is deliberate. He builds evaluation systems for LLM products for a living, which is a good reason not to point an ungoverned one at his own reputation.</p>
<p>If the answer you need is not here, email him: <a href="mailto:elroy.galbraith@gmail.com">elroy.galbraith@gmail.com</a></p>`}
];
