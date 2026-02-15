export interface QueryInput {
  idea: string;
  niche?: string;
  customer?: string;
}

export function generateQueries(input: QueryInput): string[] {
  const { idea, niche, customer } = input;
  const queries: string[] = [];

  // Base queries (always generated)
  queries.push(`${idea} complaints`);
  queries.push(`${idea} frustrating OR annoying OR broken`);
  queries.push(`${idea} alternatives comparison`);
  queries.push(`${idea} reviews`);
  queries.push(`${idea} pricing`);
  queries.push(`site:reddit.com ${idea}`);
  queries.push(`site:reddit.com ${idea} complaints OR wish OR hate`);
  queries.push(`${idea} G2 OR Capterra reviews`);

  // Niche-specific queries
  if (niche) {
    queries.push(`${niche} ${idea} workflow`);
    queries.push(`${niche} ${idea} software tools`);
    queries.push(`${niche} ${idea} spreadsheet OR manual process`);
    queries.push(`${niche} ${idea} problems`);
  }

  // Customer-specific queries
  if (customer) {
    queries.push(`${customer} ${idea} pain points`);
    queries.push(`${customer} tools for ${idea}`);
  }

  return queries;
}
