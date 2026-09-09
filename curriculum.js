/**
 * Evaluates student performance dynamically based on the institution's active curriculum adapter.
 * Handles both traditional numeric grading and CBC competency tiers.
 */
function evaluateAssessment(adapterConfig, rawScore, competencyTier) {
    if (adapterConfig.grading_type === 'CBC_RUBRIC') {
        const allowedTiers = adapterConfig.rubric_definition.tiers || ['EXCEEDING', 'MEETING', 'APPROACHING', 'BELOW'];
        if (!allowedTiers.includes(competencyTier)) {
            throw new Error(`Invalid CBC competency tier provided for adapter: ${adapterConfig.adapter_name}`);
        }
        return {
            type: 'CBC_RUBRIC',
            evaluation: competencyTier,
            passed: ['EXCEEDING', 'MEETING'].includes(competencyTier)
        };
    } 
    
    if (adapterConfig.grading_type === 'PERCENTAGE' || adapterConfig.grading_type === 'LETTER') {
        const passingThreshold = adapterConfig.rubric_definition.passing_score || 50.0;
        return {
            type: adapterConfig.grading_type,
            evaluation: rawScore,
            passed: rawScore >= passingThreshold
        };
    }

    throw new Error("Unsupported curriculum grading type.");
}

module.exports = { evaluateAssessment };
