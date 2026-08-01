/** ATS matching engine — pure scoring helpers shared by the server and the UI. */

export interface AtsJob {
  skills: string[] | null;
  preferred_skills: string[] | null;
  experience_years: number | null;
  category: string | null;
  location: string | null;
  employment_type: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
}

export interface AtsCandidate {
  skills: string[];
  experienceYears: number;
  categories: string[];
  locations: string[];
  employmentTypes: string[];
  /** Free text from summary / duties / experience — used for keyword recall. */
  narrative?: string;
}

export interface AtsScore {
  score: number;
  breakdown: {
    skills: number;
    experience: number;
    preferences: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#. ]/g, "").trim();

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/**
 * Weighted score out of 100:
 *  - 55% skills overlap (job skills + preferred skills vs candidate skills / narrative)
 *  - 25% experience vs the job's required years
 *  - 20% preference fit (category, location, employment type)
 */
export function scoreCandidate(job: AtsJob, candidate: AtsCandidate): AtsScore {
  const jobSkills = [...(job.skills ?? []), ...(job.preferred_skills ?? [])]
    .map(norm)
    .filter(Boolean);
  const uniqueJobSkills = Array.from(new Set(jobSkills));

  const candidateSkills = new Set(candidate.skills.map(norm).filter(Boolean));
  const haystack = norm(
    stripHtml(
      [candidate.narrative ?? "", candidate.skills.join(" ")].join(" "),
    ),
  );

  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of uniqueJobSkills) {
    if (candidateSkills.has(s) || (s.length > 2 && haystack.includes(s))) matched.push(s);
    else missing.push(s);
  }

  const skillsPct = uniqueJobSkills.length === 0
    ? 60 // no declared skills on the posting — neutral baseline
    : Math.round((matched.length / uniqueJobSkills.length) * 100);

  const required = job.experience_years ?? 0;
  const expPct = required <= 0
    ? 100
    : Math.min(100, Math.round((candidate.experienceYears / required) * 100));

  let prefHits = 0;
  let prefTotal = 0;
  if (job.category) {
    prefTotal++;
    if (candidate.categories.map(norm).includes(norm(job.category))) prefHits++;
  }
  if (job.location) {
    prefTotal++;
    const loc = norm(job.location);
    if (candidate.locations.some((l) => norm(l) && (norm(l).includes(loc) || loc.includes(norm(l))))) prefHits++;
  }
  if (job.employment_type) {
    prefTotal++;
    if (candidate.employmentTypes.map(norm).includes(norm(job.employment_type))) prefHits++;
  }
  const prefPct = prefTotal === 0 ? 60 : Math.round((prefHits / prefTotal) * 100);

  const score = Math.max(
    0,
    Math.min(100, Math.round(skillsPct * 0.55 + expPct * 0.25 + prefPct * 0.2)),
  );

  return {
    score,
    breakdown: {
      skills: skillsPct,
      experience: expPct,
      preferences: prefPct,
      matchedSkills: matched,
      missingSkills: missing,
    },
  };
}

/** Applications at or above this score are auto-shortlisted. */
export const SHORTLIST_THRESHOLD = 70;

export function scoreTone(score: number) {
  if (score >= SHORTLIST_THRESHOLD) return "bg-primary/10 text-primary";
  if (score >= 45) return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}
