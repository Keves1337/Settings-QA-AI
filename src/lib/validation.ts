import { z } from "zod";

// Bug validation schema
export const bugSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().min(1, "Description is required").max(5000, "Description must be less than 5000 characters"),
  severity: z.enum(['low', 'medium', 'high', 'critical'], { required_error: "Severity is required" }),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'wont_fix'], { required_error: "Status is required" }),
  steps_to_reproduce: z.string().max(10000, "Steps to reproduce must be less than 10000 characters").optional(),
  environment: z.string().max(500, "Environment must be less than 500 characters").optional(),
});

// Integration validation schemas
export const jiraConfigSchema = z.object({
  jiraUrl: z.string().trim().url("Invalid Jira URL").min(1, "Jira URL is required"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  apiToken: z.string().trim().min(1, "API token is required").max(500, "API token must be less than 500 characters"),
  projectKey: z.string().trim().min(1, "Project key is required").max(50, "Project key must be less than 50 characters").regex(/^[A-Z][A-Z0-9]*$/, "Project key must start with a letter and contain only uppercase letters and numbers"),
  enabled: z.boolean(),
  autoSync: z.boolean(),
});

export const githubConfigSchema = z.object({
  token: z.string().trim().min(1, "Token is required").max(500, "Token must be less than 500 characters").regex(/^(ghp_|github_pat_)/, "GitHub token must start with 'ghp_' or 'github_pat_'"),
  owner: z.string().trim().min(1, "Owner is required").max(100, "Owner must be less than 100 characters").regex(/^[a-zA-Z0-9-]+$/, "Owner must contain only letters, numbers, and hyphens"),
  repo: z.string().trim().min(1, "Repository name is required").max(100, "Repository name must be less than 100 characters").regex(/^[a-zA-Z0-9-_.]+$/, "Repository name must contain only letters, numbers, hyphens, underscores, and periods"),
  enabled: z.boolean(),
  autoSync: z.boolean(),
});

// Fuzz testing validation
export const fuzzTestConfigSchema = z.object({
  iterations: z.number().int().min(1, "At least 1 iteration required").max(100, "Maximum 100 iterations allowed"),
});
