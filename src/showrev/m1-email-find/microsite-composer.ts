import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { Prospect } from './importer.js';
import type { PatternSelection } from './influence.js';

export type MicrositeFormat = 'field-brief' | 'interactive-demo' | 'gamified-challenge' | 'work-product-preview';

export interface MicrositeRow {
  slug: string;
  prospect_id: string;
  run_id: string;
  company_name: string;
  recipient_name: string;
  recipient_title: string;
  headline: string;
  insight_text: string;
  case_study_text: string;
  ae_name: string;
  ae_title: string;
  ae_email: string;
  ae_phone: string;
  ae_booking_url: string;
  ae_photo_url: string;
  format: MicrositeFormat;
  status: 'draft' | 'live';
}

interface CaseStudy {
  id: string;
  segment: string;
  persona: string;
  text: string;
  status: 'generated' | 'approved';
  approved_by: string | null;
}

const AE_DETAILS: Record<string, { title: string; phone: string; booking_url: string; photo_url: string }> = {
  'Mike Rutski': {
    title: 'Sr. Account Executive',
    phone: '',
    booking_url: 'https://meetings-na2.hubspot.com/michael-rutski/introduction',
    photo_url: '/assets/ae/mike-rutski.jpg',
  },
  'Nathan Dunn': {
    title: 'Sr. Account Executive',
    phone: '',
    booking_url: 'https://meetings-na2.hubspot.com/nathan970/introduction',
    photo_url: '/assets/ae/nathan-dunn.jpg',
  },
  'Lucas Spencer': {
    title: 'Sr. Account Executive',
    phone: '',
    booking_url: 'https://meetings-na2.hubspot.com/lucas-spencer/introduction',
    photo_url: '/assets/ae/lucas-spencer.jpg',
  },
};

const DEFAULT_CASE_STUDIES: CaseStudy[] = [
  { id: 'cs-001', segment: 'fiber_operator', persona: 'build_pace', text: 'A fiber operator cut construction drawing production from days to minutes, giving their team time to QC properly before jurisdictional submission.', status: 'generated', approved_by: null },
  { id: 'cs-002', segment: 'ae_firm', persona: 'drawings_quality', text: 'An A&E firm compressed drawing turnaround from weeks to days, allowing them to take on 3 additional ISP clients without adding headcount.', status: 'generated', approved_by: null },
  { id: 'cs-003', segment: 'contractor', persona: 'build_pace', text: 'A multi-state contractor kept drawings ahead of their construction schedule by automating the GIS-to-CAD step. Crews stopped waiting on documentation.', status: 'generated', approved_by: null },
  { id: 'cs-004', segment: 'fiber_operator', persona: 'permit_cycle', text: 'A regional ISP expanding into 6 new municipalities standardized drawing output across all jurisdictions from a single GIS input process.', status: 'generated', approved_by: null },
  { id: 'cs-005', segment: 'fiber_operator', persona: 'cycle_time_exec', text: 'A fiber operator processing 200+ drawings per month achieved 70% reduction in construction drawing cycle time with existing headcount.', status: 'generated', approved_by: null },
];

function loadCaseStudies(brainDir: string): CaseStudy[] {
  const libPath = resolve(brainDir, 'case-study-library.json');
  if (!existsSync(libPath)) return DEFAULT_CASE_STUDIES;
  try {
    return JSON.parse(readFileSync(libPath, 'utf-8'));
  } catch {
    return DEFAULT_CASE_STUDIES;
  }
}

function selectCaseStudy(
  studies: CaseStudy[],
  segment: string,
  persona: string,
  productionMode: boolean = false,
): CaseStudy | null {
  const eligible = productionMode
    ? studies.filter(s => s.status === 'approved')
    : studies;

  const exactMatch = eligible.find(s => s.segment === segment && s.persona === persona);
  if (exactMatch) return exactMatch;

  const segmentMatch = eligible.find(s => s.segment === segment);
  if (segmentMatch) return segmentMatch;

  return eligible[0] || null;
}

function composeHeadline(
  challengerInsight: string,
  companyName: string,
): string {
  if (!challengerInsight) return `What ${companyName} should know before the next build cycle`;

  const cleaned = challengerInsight
    .replace(/^The\s+/i, '')
    .replace(/\.$/, '');

  if (cleaned.length <= 80) return cleaned;
  return cleaned.slice(0, 77) + '...';
}

function composeInsightText(
  challengerInsight: string,
  researchSummary: string,
  companyName: string,
): string {
  if (challengerInsight && challengerInsight.length > 50) {
    return challengerInsight.slice(0, 300);
  }

  const firstSentences = researchSummary
    .split(/[.!?]\s+/)
    .filter(s => s.toLowerCase().includes(companyName.toLowerCase()))
    .slice(0, 2)
    .join('. ');

  if (firstSentences) return firstSentences.slice(0, 300) + '.';

  return `We researched ${companyName}'s current operations and found something worth discussing.`;
}

function detectSegment(prospect: Prospect): string {
  const titleLower = prospect.title.toLowerCase();
  const companyLower = prospect.company.toLowerCase();

  if (/a&e|architect|design|engineering firm/i.test(companyLower)) return 'ae_firm';
  if (/construct|contractor|builder|drill/i.test(companyLower)) return 'contractor';
  return 'fiber_operator';
}

export function composeMicrositeContent(
  prospect: Prospect,
  runId: string,
  micrositeSlug: string,
  ae: { name: string; email: string },
  challengerInsight: string,
  researchSummary: string,
  personaBucket: string,
  brainDir?: string,
  productionMode: boolean = false,
): MicrositeRow {
  const aeDetails = AE_DETAILS[ae.name] || AE_DETAILS['Lucas Spencer'];
  const segment = detectSegment(prospect);
  const studies = brainDir ? loadCaseStudies(brainDir) : DEFAULT_CASE_STUDIES;
  const caseStudy = selectCaseStudy(studies, segment, personaBucket, productionMode);

  return {
    slug: micrositeSlug,
    prospect_id: prospect.id,
    run_id: runId,
    company_name: prospect.company,
    recipient_name: `${prospect.firstName} ${prospect.lastName}`,
    recipient_title: prospect.title,
    headline: composeHeadline(challengerInsight, prospect.company),
    insight_text: composeInsightText(challengerInsight, researchSummary, prospect.company),
    case_study_text: caseStudy?.text || '',
    ae_name: ae.name,
    ae_title: aeDetails.title,
    ae_email: ae.email,
    ae_phone: aeDetails.phone,
    ae_booking_url: aeDetails.booking_url,
    ae_photo_url: aeDetails.photo_url,
    format: 'field-brief',
    status: 'draft',
  };
}
