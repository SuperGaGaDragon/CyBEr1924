import "./AboutPage.css";

const capabilities = [
  "Generate large essays, research papers, and structured reports",
  "Write long novels（multi-chapter, multi-scene）with consistent arcs",
  "Maintain style, tone, logic, and narrative coherence",
  "Execute multi-stage projects with transparent intermediate reasoning",
  "Visualize agent conversations during planning and execution",
  "Let humans intervene, revise, redirect, and approve each step",
  "Guarantee quality and block hallucinated jumps through strict review",
];

const painPoints = [
  "Single-pass writing drifts quickly and skips structure",
  "Big tasks（20-page essay、长篇小说、课程笔记）难以落地",
  "Users want to adjust structure, but the model replaces content blindly",
  "Generation often jumps步骤、跳章节，质量无法统一",
  "Internal reasoning is invisible，用户无法监督",
];

const roles = [
  {
    title: "Planner — Task Architect",
    summary: "把模糊目标变成可执行路线图，输出 worker 可直接执行的步骤。",
    bullets: [
      "多轮对话确认需求、格式、风格",
      "拆出章节 / 场景 / 论点 / 小节",
      "用户确认后冻结结构，后续经由 Coordinator 调整",
    ],
  },
  {
    title: "Worker — Execution Engine",
    summary: "完全遵循计划，分段写作与填充内容，不直接对话用户。",
    bullets: [
      "每次只写一个 subtask，可多轮 partial → complete",
      "把草稿写入当前 artifact",
      "不改计划，只负责高质量输出",
    ],
  },
  {
    title: "Coordinator — 项目经理",
    summary: "用户代言人 & 调度中枢，决定推进顺序、重写、暂停与改动需求。",
    bullets: [
      "收集用户反馈并回传给 Planner / Worker",
      "调度任务，保持风格与目标一致",
      "不直接生成内容，只做管理与桥接",
    ],
  },
  {
    title: "Reviewer — 质量闸口",
    summary: "独立质量监督员，只有 reviewer 同意，流程才前进。",
    bullets: [
      "检查逻辑、风格、质量一致性",
      "disagree 时返回 comment，阻止进入下一步",
      "agree 后才允许推进后续任务",
    ],
  },
];

const useCases = [
  {
    title: "Academic Essays",
    items: [
      "Argumentative / comparative / literary critique",
      "Research mini-paper & structured long essay（10–25 pages）",
      "APA / MLA / Chicago 格式",
    ],
  },
  {
    title: "Novels / Fiction",
    items: [
      "多章节长篇故事与场景化写作",
      "世界观构建、人物成长线、多视角叙事",
      "长篇连载小说（数十万字）",
    ],
  },
  {
    title: "Technical / Business",
    items: [
      "产品、技术与市场文档",
      "课题规划、科研报告、复杂 essay",
      "大型信息汇总与知识结构化",
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
            CyBEr1924 是一个“可解释、可监督、可迭代”的多智能体写作与任务协作平台。
            它把长任务拆解、审查、重写的流程透明化，让学生、作家、研究人员、开发者都能安全驱动大型写作与多阶段项目。
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
                Unlike single-pass LLM writing, CyBEr1924 keeps tone、style、逻辑、一致性 across long horizons by
                keeping every intermediate step visible、可审查、可重来，避免“hallucinated jumps”。
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
              <p>传统单轮生成容易跑偏、跳章节、失控；大任务缺少可监督的中间过程。</p>
              <p>CyBEr1924 用多轮、可见、可审查的 orchestrator 流程让长任务变得可控、可监督、可重来。</p>
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
            <div className="loop-step">User → Planner →（confirm）→ Worker → Reviewer → Coordinator → Worker → Reviewer → ...</div>
            <div className="loop-meta">
              <div className="pill-ghost">每一步都有日志、snapshot、artifacts，可追溯可回滚。</div>
              <div className="pill-ghost">透明展示所有 agent 对话，方便监督与改写。</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">Updated process placeholder</div>
          <div className="text-block">
            <p>
              把你的“红色词修正流程”发给我，我会在一分钟内把它写成正式流程文字版 + 箭头式 flow chart，
              还会给出面向开发者的页面版本与文档版本，随时可合入前端。
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
            <li className="list-item">Clear structure（Planner）+ progressive drafting（Worker）确保每一步有据可依。</li>
            <li className="list-item">严格 reviewer gate，disagree 即重写，agree 才能推进。</li>
            <li className="list-item">Coordinator 代表用户做决策：暂停、继续、改写、重排顺序。</li>
            <li className="list-item">所有中间 reasoning 可视化，避免隐形跳跃，提升可信度。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
