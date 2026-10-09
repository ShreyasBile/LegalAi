import { NextResponse } from 'next/server';
import {
  runOpposingCounselDevilAdvocate,
  verifyCitationHallucinations,
  generateTimelineAndDepositionQuestions,
  completePleadingSubstance,
  draftAnticipatoryBailPetition,
  rewriteSemanticCaseLawQuery,
  digestCourtOrder,
  classifyCauseOfActionAndLimitation,
  restructureCourtRulesCompliance,
  summarizeVernacularDocuments,
  auditJudicialVulnerability,
  predictECourtsNextStage,
  generateClientWhatsAppBriefing,
  draftUrgentInterimApplicationOrCaveat,
  buildWitnessContradictionMatrix,
} from '@/lib/ai/services';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload, apiKey } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 });
    }

    switch (action) {
      case 'devils-advocate': {
        const result = await runOpposingCounselDevilAdvocate(
          payload.matterTitle,
          payload.court,
          payload.argumentsList,
          apiKey
        );
        return NextResponse.json(result);
      }

      case 'citation-guard': {
        const result = await verifyCitationHallucinations(payload.draftText, apiKey);
        return NextResponse.json(result);
      }

      case 'timeline-deposition': {
        const result = await generateTimelineAndDepositionQuestions(payload.documents, apiKey);
        return NextResponse.json(result);
      }

      case 'pleading-completer': {
        const result = await completePleadingSubstance(
          payload.paraNumber,
          payload.opponentAverment,
          payload.stance,
          payload.matterFacts,
          apiKey
        );
        return NextResponse.json({ completedReply: result });
      }

      case 'bail-drafter': {
        const result = await draftAnticipatoryBailPetition(
          payload.firDetails,
          payload.applicantDetails,
          apiKey
        );
        return NextResponse.json({ petitionDraft: result });
      }

      case 'semantic-query': {
        const result = await rewriteSemanticCaseLawQuery(payload.rawQuery, apiKey);
        return NextResponse.json(result);
      }

      case 'order-digest': {
        const result = await digestCourtOrder(payload.orderText, apiKey);
        return NextResponse.json(result);
      }

      case 'limitation-classifier': {
        const result = await classifyCauseOfActionAndLimitation(payload.disputeSummary, apiKey);
        return NextResponse.json(result);
      }

      case 'court-rules-fixer': {
        const result = await restructureCourtRulesCompliance(
          payload.draftContent,
          payload.courtName,
          apiKey
        );
        return NextResponse.json(result);
      }

      case 'vernacular-summarizer': {
        const result = await summarizeVernacularDocuments(payload.vernacularText, apiKey);
        return NextResponse.json(result);
      }

      case 'vulnerability-audit': {
        const result = await auditJudicialVulnerability(payload.draftPleading, apiKey);
        return NextResponse.json(result);
      }

      case 'ecourts-predictor': {
        const result = await predictECourtsNextStage(payload.caseType, payload.history, apiKey);
        return NextResponse.json(result);
      }

      case 'client-briefing': {
        const result = await generateClientWhatsAppBriefing(
          payload.clientName,
          payload.matterTitle,
          payload.hearingOutcome,
          payload.language,
          apiKey
        );
        return NextResponse.json({ briefing: result });
      }

      case 'interim-caveat': {
        const result = await draftUrgentInterimApplicationOrCaveat(
          payload.court,
          payload.caveator,
          payload.opponent,
          payload.subjectMatter,
          payload.type,
          apiKey
        );
        return NextResponse.json({ draft: result });
      }

      case 'witness-matrix': {
        const result = await buildWitnessContradictionMatrix(
          payload.witnessStatements,
          apiKey
        );
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI Processing Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
