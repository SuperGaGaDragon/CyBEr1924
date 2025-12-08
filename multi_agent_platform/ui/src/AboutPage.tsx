import "./AboutPage.css";
import developer1 from "./assets/developer1.png";
import developer2 from "./assets/developer2.png";

const capabilities = [
  "Generate long-form essays, research papers, and structured reports",
  "Write multi-chapter novels with consistent arcs and tone",
  "Maintain style, logic, and narrative coherence across hundreds of pages",
  "Execute multi-stage projects with transparent intermediate reasoning",
  "Visualize agent conversations during planning and execution",
  "Invite humans to intervene, revise, redirect, and approve each step",
  "Guarantee quality and block hallucinated jumps through strict review",
];

const painPoints = [
  "Single-pass writing drifts quickly and skips structure",
  "Large tasks (20-page essays, long novels, course notes) fall apart mid-run",
  "Users want structure changes; models swap content blindly instead",
  "Steps and chapters get skipped, creating incoherent jumps",
  "Quality is uneven and the internal reasoning is invisible",
];

const roles = [
  {
    title: "Planner — Task Architect",
    summary: "Turns fuzzy goals into executable roadmaps for the Worker.",
    bullets: [
      "Multi-turn clarification of goals, format, and style",
      "Outputs chapters, scenes, arguments, and sections",
      "Structure locks after user confirmation; later tweaks flow via Coordinator",
    ],
  },
  {
    title: "Worker — Execution Engine",
    summary: "Writes by following the plan, one subtask at a time.",
    bullets: [
      "Partial → partial → complete drafting loops",
      "Commits drafts into artifacts for traceability",
      "Never changes the plan; only produces high-quality text",
    ],
  },
  {
    title: "Coordinator — Project Manager",
    summary: "User’s proxy and traffic controller; decides rewrite, pause, or proceed.",
    bullets: [
      "Collects user feedback and relays to Planner/Worker",
      "Keeps style and goals consistent across tasks",
      "Never writes content; only manages and bridges",
    ],
  },
  {
    title: "Reviewer — Quality Gate",
    summary: "Independent QA gate; progress only continues on agreement.",
    bullets: [
      "Checks logic, style, and consistency",
      "Disagree → block and comment; agree → allow next step",
      "Prevents hidden jumps or silent quality loss",
    ],
  },
];

const useCases = [
  {
    title: "Academic Essays",
    items: [
      "Argumentative, comparative, literary critique",
      "Research mini-papers and structured long essays (10–25 pages)",
      "APA / MLA / Chicago formatting",
    ],
  },
  {
    title: "Novels / Fiction",
    items: [
      "Multi-chapter long-form stories and scene-based writing",
      "Worldbuilding, character arcs, multi-POV narratives",
      "Serial fiction at hundreds of thousands of words",
    ],
  },
  {
    title: "Technical / Business",
    items: [
      "Product, technical, and market documentation",
      "Project proposals, research reports, complex essays",
      "Large-scale information synthesis and knowledge structuring",
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-backdrop about-backdrop-left" />
      <div className="about-backdrop about-backdrop-right" />

      <div className="about-shell">
        <header className="about-header">
          <div className="about-brand">
            <div className="about-brand-mark">CyBEr</div>
            <div className="about-brand-number">1924</div>
          </div>
          <div className="about-actions">
            <div className="about-pill muted">Overview Document — Dec 2025</div>
            <a className="about-pill" href="/">Back to platform</a>
          </div>
        </header>

        <section className="hero">
          <div className="hero-kicker">Multi-Agent Intelligent Writing & Project Orchestration Platform</div>
          <h1>About CyBEr1924</h1>
          <p className="hero-lead">
            CyBEr1924 is a transparent, supervised, multi-agent writing and orchestration platform.
            It makes every step of long tasks visible—planning, drafting, reviewing, and revising—so writers,
            students, researchers, and builders can run ambitious projects with confidence.
          </p>
          <div className="hero-grid">
            <div className="hero-card">
              <p>
                CyBEr1924 is a next-generation multi-agent orchestration system for complex writing, creative generation,
                structured task execution, and long-form reasoning. It combines multi-step planning, iterative drafting,
                human-aligned coordination, and quality-controlled progression to deliver stable, high-quality outputs.
              </p>
            </div>
            <div className="hero-card">
              <p>
                Unlike single-pass LLM writing, CyBEr1924 keeps tone, style, logic, and coherence intact across long horizons
                by exposing every intermediate step. Nothing is hidden; every decision is reviewable and redo-able—no hallucinated jumps.
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">What CyBEr1924 can do</div>
          <ul className="list two-col">
            {capabilities.map((item) => (
              <li key={item} className="list-item">{item}</li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section-title">Problems we solve</div>
          <div className="section-grid">
            <div className="text-block">
              <p>Single-pass generation drifts, skips chapters, and hides the middle steps. Large projects collapse without supervision.</p>
              <p>CyBEr1924 uses a multi-turn, visible, reviewable orchestration loop to keep long tasks controlled, auditable, and restartable.</p>
            </div>
            <ul className="list">
              {painPoints.map((item) => (
                <li key={item} className="list-item">{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="section-title">Four specialized agents</div>
          <div className="card-grid">
            {roles.map((role) => (
              <div key={role.title} className="card">
                <div className="card-title">{role.title}</div>
                <div className="card-summary">{role.summary}</div>
                <ul className="list">
                  {role.bullets.map((bullet) => (
                    <li key={bullet} className="list-item">{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Orchestrator loop</div>
          <div className="loop">
            <div className="loop-step">User → Planner → (confirm) → Worker → Reviewer → Coordinator → Worker → Reviewer → ...</div>
            <div className="loop-meta">
              <div className="pill-ghost">Every step is logged with snapshots and artifacts—traceable and rewindable.</div>
              <div className="pill-ghost">All agent conversations are transparent, making supervision and edits easy.</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">Updated process placeholder</div>
          <div className="text-block">
            <p>
              Share your latest process notes and we will fold them into a clear text flow + arrow-style chart,
              along with a developer-facing version and a documentation-ready description.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="section-title">Use cases & outputs</div>
          <div className="card-grid">
            {useCases.map((useCase) => (
              <div key={useCase.title} className="card">
                <div className="card-title">{useCase.title}</div>
                <ul className="list">
                  {useCase.items.map((item) => (
                    <li key={item} className="list-item">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Quality and human steering</div>
          <ul className="list two-col">
            <li className="list-item">Clear structure (Planner) + progressive drafting (Worker) keep every step grounded.</li>
            <li className="list-item">Strict reviewer gate: disagree → rewrite; agree → move forward.</li>
            <li className="list-item">Coordinator represents the user: pause, continue, rewrite, or resequence.</li>
            <li className="list-item">All intermediate reasoning is visible—no hidden jumps, higher trust.</li>
          </ul>
        </section>

        <section className="section developers">
          <div className="section-title">Developers</div>
          <div className="dev-meta">This website is developed by two high school students.</div>
          <div className="dev-grid">
            <div className="dev-card">
              <div className="dev-avatar">
                <img src={developer1} alt="Quanhao Li" />
              </div>
              <div className="dev-info">
                <div className="dev-name">Quanhao Li</div>
                <div className="dev-role">Co-developer</div>
              </div>
            </div>
            <div className="dev-card">
              <div className="dev-avatar">
                <img src={developer2} alt="Qianyu Chen" />
              </div>
              <div className="dev-info">
                <div className="dev-name">Qianyu Chen</div>
                <div className="dev-role">Co-developer</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
