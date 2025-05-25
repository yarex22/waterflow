class FinancialMonitor {
    constructor() {
        this.thresholds = {
            revenueCoverage: 0.8,  // Receita deve cobrir pelo menos 80% das despesas
            outrosMaxPercent: 0.2,  // Categoria "Outros" não deve exceder 20%
            collectionRateMin: 0.5  // Reduzido de 0.7 para 0.5 (50%)
        };
    }

    analyzeFinancials(revenue, expenses, outrosExpenses, collectionRate) {
        const alerts = [];
        
        // Verificação da cobertura de receita
        const coverageRatio = revenue / expenses;
        if (coverageRatio < this.thresholds.revenueCoverage) {
            alerts.push({
                type: 'CRÍTICO',
                metric: 'Cobertura de Receita',
                value: `${(coverageRatio * 100).toFixed(2)}%`,
                recommendation: 'Implementar medidas imediatas de recuperação de receita'
            });
        }
        
        // Verificação da categoria Outros
        const outrosRatio = outrosExpenses / expenses;
        if (outrosRatio > this.thresholds.outrosMaxPercent) {
            alerts.push({
                type: 'ALTO',
                metric: 'Categorização de Despesas',
                value: `${(outrosRatio * 100).toFixed(2)}% em Outros`,
                recommendation: 'Revisar e categorizar corretamente as despesas'
            });
        }
        
        // Verificação da taxa de cobrança
        if (collectionRate < this.thresholds.collectionRateMin) {
            alerts.push({
                type: 'CRÍTICO',
                metric: 'Taxa de Cobrança',
                value: `${(collectionRate * 100).toFixed(2)}%`,
                recommendation: 'Implementar medidas urgentes de melhoria na cobrança'
            });
        }
        
        return alerts;
    }
}

class MeterHealthMonitor {
    constructor() {
        this.riskThresholds = {
            zeroReadingsMax: 1,        // Reduzido de 2 para 1
            variationCoefficientMax: 0.25,  // Reduzido de 0.3 para 0.25
            minExpectedConsumption: 3   // Reduzido de 5 para 3 m³
        };
    }

    calculateMeterRiskScore(meterData) {
        let riskScore = 0;
        const alerts = [];
        
        // Verificar leituras zero
        if (meterData.zeroReadings > this.riskThresholds.zeroReadingsMax) {
            riskScore += 30;
            alerts.push('Detectadas leituras zero em excesso');
        }
        
        // Verificar variação de consumo
        if (meterData.variationCoefficient > this.riskThresholds.variationCoefficientMax) {
            riskScore += 25;
            alerts.push('Detectada alta variação no consumo');
        }

        // Verificar leituras altas
        if (meterData.highReadings > 0) {
            riskScore += 20;
            alerts.push('Detectados picos de consumo anormais');
        }

        // Verificar consumo médio muito baixo
        if (meterData.avgConsumption < this.riskThresholds.minExpectedConsumption) {
            riskScore += 15;
            alerts.push('Consumo médio abaixo do esperado');
        }
        
        return {
            meterId: meterData.meterId,
            category: meterData.category,
            riskScore,
            alerts,
            metrics: {
                zeroReadings: meterData.zeroReadings,
                variationCoefficient: meterData.variationCoefficient,
                avgConsumption: meterData.avgConsumption,
                highReadings: meterData.highReadings
            },
            recommendation: this.getRecommendation(riskScore)
        };
    }

    getRecommendation(riskScore) {
        if (riskScore >= 50) {
            return 'Inspeção imediata do medidor necessária';
        } else if (riskScore >= 30) {
            return 'Agendar verificação do medidor em 2 semanas';
        } else if (riskScore >= 15) {
            return 'Incluir na próxima rota de inspeção';
        }
        return 'Monitorar desempenho do medidor';
    }
}

class DashboardRecommendationEngine {
    constructor() {
        this.financialMonitor = new FinancialMonitor();
        this.meterMonitor = new MeterHealthMonitor();
    }

    generateRecommendations(utilityData) {
        const recommendations = {
            financial: [],
            operational: [],
            priorityActions: []
        };
        
        // Análise financeira
        const financialAlerts = this.financialMonitor.analyzeFinancials(
            utilityData.revenue,
            utilityData.expenses,
            utilityData.outrosExpenses,
            utilityData.collectionRate
        );
        
        // Adicionar todos os alertas financeiros
        recommendations.financial = financialAlerts;
        
        // Análise dos medidores
        const meterHealth = utilityData.meters.map(meter => 
            this.meterMonitor.calculateMeterRiskScore(meter)
        );
        
        // Adicionar alertas operacionais
        recommendations.operational = meterHealth;
        
        // Priorizar recomendações
        this.prioritizeActions(financialAlerts, meterHealth, recommendations);
        
        return recommendations;
    }

    prioritizeActions(financialAlerts, meterHealth, recommendations) {
        // Adicionar alertas financeiros críticos às ações prioritárias
        const criticalFinancials = financialAlerts.filter(alert => alert.type === 'CRÍTICO');
        if (criticalFinancials.length > 0) {
            recommendations.priorityActions.push(
                ...criticalFinancials.map(alert => alert.recommendation)
            );
        }
        
        // Adicionar medidores de alto risco às ações prioritárias
        const highRiskMeters = meterHealth.filter(meter => meter.riskScore >= 50);
        if (highRiskMeters.length > 0) {
            recommendations.priorityActions.push(
                ...highRiskMeters.map(meter => 
                    `Inspecionar medidor ${meter.meterId}: ${meter.recommendation}`
                )
            );
        }
    }
}

module.exports = {
    FinancialMonitor,
    MeterHealthMonitor,
    DashboardRecommendationEngine
};