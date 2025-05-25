const express = require("express");
const reportRoutes = express.Router();
const {
    getCustomerConsumptionReport,
    getFinancialReport,
    getDefaultersReport,
    getReadingsReport,
    getSystemEfficiencyReport,
    getDashboardFinanceiro
} = require("../../controllers/waterflow/report/reportController");

const {
    createEnergyReading,
    getEnergyByMonth,
    getEnergyByCompany,
    getEnergyByCustomer,
    getEnergyByDateRange
} = require("../../controllers/waterflow/energy/energyController");


const { isAuthenticated, isAdmin, isManager, isReader, isReportViewer } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

// Aplicar middleware de autenticação em todas as rotas
reportRoutes.use(isAuthenticated);

// Rotas públicas

// Rotas de relatórios (acessíveis por admin e report_viewer)
reportRoutes.get("/consumption/summary", [isReportViewer], async (req, res, next) => {
    try {
        // Implementar lógica do relatório de consumo
        // Este relatório estará disponível para report_viewer e admin
    } catch (error) {
        next(error);
    }
});

reportRoutes.get("/financial/summary", [isReportViewer], async (req, res, next) => {
    try {
        // Implementar lógica do relatório financeiro
        // Este relatório estará disponível para report_viewer e admin
    } catch (error) {
        next(error);
    }
});

reportRoutes.get("/customers/analysis", [isReportViewer], async (req, res, next) => {
    try {
        // Implementar lógica do relatório de análise de clientes
        // Este relatório estará disponível para report_viewer e admin
    } catch (error) {
        next(error);
    }
});

// Rotas administrativas (protegidas)
reportRoutes.get("/customer/consumption", isAuthenticated, checkCompanyAccess('Company'), getCustomerConsumptionReport);
reportRoutes.get("/financial", isAuthenticated, checkCompanyAccess('Company'), getFinancialReport);
reportRoutes.get("/defaulters", isAuthenticated, checkCompanyAccess('Company'), getDefaultersReport);
reportRoutes.get("/readings", isAuthenticated, checkCompanyAccess('Company'), getReadingsReport);
reportRoutes.get("/system/efficiency", isAuthenticated, checkCompanyAccess('Company'), getSystemEfficiencyReport);
reportRoutes.get("/dashboard/financeiro", isAuthenticated, checkCompanyAccess('Company'), getDashboardFinanceiro);

reportRoutes.post("/energy/create", isAuthenticated, checkCompanyAccess('Company'), createEnergyReading);
reportRoutes.get("/energy/month/:month", isAuthenticated, checkCompanyAccess('Company'), getEnergyByMonth);
// reportRoutes.get("/energy/company/:companyId", isAuthenticated, getEnergyByCompany);
// reportRoutes.get("/energy/customer/:customerId", isAuthenticated, getEnergyByCustomer);
// reportRoutes.get("/energy/date-range", isAuthenticated, getEnergyByDateRange);

// Rotas administrativas (apenas admin)
reportRoutes.post("/custom", [isAdmin], async (req, res, next) => {
    try {
        // Implementar lógica para criar relatórios personalizados
        // Apenas admin pode criar novos tipos de relatórios
    } catch (error) {
        next(error);
    }
});

module.exports = reportRoutes;