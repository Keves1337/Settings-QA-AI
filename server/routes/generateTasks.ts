import { Request, Response } from "express";
import OpenAI from "openai";

const TASK_TEMPLATES: Record<string, Array<{ title: string; description: string; priority: "low" | "medium" | "high"; phase: string }>> = {
  Planning: [
    { title: "Define project scope and objectives", description: "Document the goals, deliverables, constraints, and success criteria for the project.", priority: "high", phase: "Planning" },
    { title: "Identify stakeholders and communication plan", description: "List all stakeholders, their roles, and establish a communication cadence.", priority: "high", phase: "Planning" },
    { title: "Perform feasibility analysis", description: "Assess technical, financial, and timeline feasibility of the project.", priority: "medium", phase: "Planning" },
    { title: "Create project charter", description: "Draft the formal project charter document for sponsor sign-off.", priority: "high", phase: "Planning" },
    { title: "Define risk management strategy", description: "Identify potential risks, their likelihood, and mitigation strategies.", priority: "medium", phase: "Planning" },
  ],
  Requirements: [
    { title: "Gather functional requirements", description: "Conduct stakeholder interviews and workshops to capture all functional requirements.", priority: "high", phase: "Requirements" },
    { title: "Document non-functional requirements", description: "Specify performance, security, scalability, and compliance requirements.", priority: "high", phase: "Requirements" },
    { title: "Create user stories and acceptance criteria", description: "Write user stories in the 'As a / I want / So that' format with clear acceptance criteria.", priority: "high", phase: "Requirements" },
    { title: "Requirements traceability matrix", description: "Build a matrix mapping requirements to design elements and test cases.", priority: "medium", phase: "Requirements" },
    { title: "Get requirements sign-off", description: "Schedule a review session with stakeholders and obtain formal approval.", priority: "medium", phase: "Requirements" },
  ],
  Design: [
    { title: "Create system architecture diagram", description: "Design the high-level architecture including components, services, and data flows.", priority: "high", phase: "Design" },
    { title: "Design database schema", description: "Define all entities, relationships, indexes, and constraints for the data model.", priority: "high", phase: "Design" },
    { title: "Create UI/UX wireframes", description: "Produce wireframes and prototypes for all key user-facing screens.", priority: "high", phase: "Design" },
    { title: "Define API contracts", description: "Specify all API endpoints, request/response formats, and error codes.", priority: "medium", phase: "Design" },
    { title: "Security design review", description: "Review architecture for security vulnerabilities and define security controls.", priority: "high", phase: "Design" },
  ],
  Development: [
    { title: "Set up development environment", description: "Configure local dev environments, CI/CD pipeline, and code repositories.", priority: "high", phase: "Development" },
    { title: "Implement core business logic", description: "Develop the primary application features based on approved requirements.", priority: "high", phase: "Development" },
    { title: "Write unit tests", description: "Create unit tests with minimum 80% code coverage for all business logic.", priority: "high", phase: "Development" },
    { title: "Code review process", description: "Establish peer review standards and conduct reviews for all pull requests.", priority: "medium", phase: "Development" },
    { title: "Integrate third-party services", description: "Connect and test all external APIs, libraries, and services.", priority: "medium", phase: "Development" },
  ],
  Testing: [
    { title: "Create test plan", description: "Define the testing strategy, scope, resources, and schedule.", priority: "high", phase: "Testing" },
    { title: "Execute functional test cases", description: "Run all functional test cases and document results.", priority: "high", phase: "Testing" },
    { title: "Perform regression testing", description: "Validate that new changes haven't broken existing functionality.", priority: "high", phase: "Testing" },
    { title: "Conduct performance testing", description: "Load test the application to verify it meets performance benchmarks.", priority: "medium", phase: "Testing" },
    { title: "Security penetration testing", description: "Perform security testing to identify vulnerabilities before release.", priority: "high", phase: "Testing" },
  ],
  Deployment: [
    { title: "Create deployment runbook", description: "Document step-by-step deployment procedures, rollback plans, and verification checks.", priority: "high", phase: "Deployment" },
    { title: "Configure production environment", description: "Set up and harden the production infrastructure, environment variables, and monitoring.", priority: "high", phase: "Deployment" },
    { title: "Execute production deployment", description: "Deploy the application following the approved runbook with team standby.", priority: "high", phase: "Deployment" },
    { title: "Post-deployment smoke testing", description: "Run critical path smoke tests immediately after deployment to verify functionality.", priority: "high", phase: "Deployment" },
    { title: "Update release documentation", description: "Publish release notes, changelog, and update user-facing documentation.", priority: "medium", phase: "Deployment" },
  ],
  Maintenance: [
    { title: "Monitor application health", description: "Set up dashboards and alerts for uptime, error rates, and performance metrics.", priority: "high", phase: "Maintenance" },
    { title: "Address bug reports", description: "Triage, prioritize, and fix reported bugs according to severity.", priority: "high", phase: "Maintenance" },
    { title: "Plan minor feature updates", description: "Collect user feedback and plan the next iteration of improvements.", priority: "medium", phase: "Maintenance" },
    { title: "Database optimization", description: "Review query performance, indexes, and run maintenance tasks.", priority: "medium", phase: "Maintenance" },
    { title: "Security patch management", description: "Apply security patches to dependencies and infrastructure on a regular schedule.", priority: "high", phase: "Maintenance" },
  ],
};

function getTemplateTasks(phase: string, existingTasks: any[]) {
  const existingTitles = new Set((existingTasks || []).map((t: any) => t.title?.toLowerCase()));
  let candidates: typeof TASK_TEMPLATES[string] = [];

  if (phase === "all") {
    for (const p of Object.keys(TASK_TEMPLATES)) {
      candidates.push(...TASK_TEMPLATES[p]);
    }
  } else {
    candidates = TASK_TEMPLATES[phase] || [];
  }

  const filtered = candidates.filter(t => !existingTitles.has(t.title.toLowerCase()));
  return phase === "all" ? filtered.slice(0, 5) : filtered.slice(0, 5);
}

export async function generateTasks(req: Request, res: Response) {
  const { phase, existingTasks } = req.body;

  if (!phase || typeof phase !== "string") {
    return res.status(400).json({ error: "Invalid phase parameter" });
  }

  const validPhases = ["all", "Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"];
  if (!validPhases.includes(phase)) {
    return res.status(400).json({ error: "Invalid phase value" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const tasks = getTemplateTasks(phase, existingTasks || []);
    return res.json({ tasks });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const userPrompt = phase === "all"
      ? `Generate 5 diverse tasks across different SDLC phases (Planning, Requirements, Design, Development, Testing, Deployment, Maintenance). Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`
      : `Generate 3-5 specific tasks for the ${phase} phase of the SDLC. Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI assistant specialized in software development lifecycle (SDLC) management. Generate practical, actionable tasks for software development projects." },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_tasks",
          description: "Generate actionable SDLC tasks with proper categorization",
          parameters: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    phase: { type: "string", enum: ["Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"] },
                  },
                  required: ["title", "description", "priority", "phase"],
                },
              },
            },
            required: ["tasks"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_tasks" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return res.status(500).json({ error: "No tasks generated" });
    return res.json(JSON.parse(toolCall.function.arguments));
  } catch (error: any) {
    console.error("Error generating tasks:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Rate limit exceeded." });
    const tasks = getTemplateTasks(phase, existingTasks || []);
    return res.json({ tasks });
  }
}
