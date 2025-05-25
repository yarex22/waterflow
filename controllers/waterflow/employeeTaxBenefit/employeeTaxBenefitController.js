// controllers/waterflow/EmployeeTaxBenefitController.js
const EmployeeTaxBenefit = require('../../../models/waterflow/employeeTaxBenefit/EmployeeTaxBenefitModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const Employee = require('../../../models/waterflow/employee/EmployeeModel');

// Criar um novo imposto ou benefício
exports.createEmployeeTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const employeeTaxBenefitData = req.body;
        console.log('Dados recebidos para criação do benefício:', employeeTaxBenefitData);

        // Verificar se todos os campos obrigatórios estão presentes
        if (!employeeTaxBenefitData.employee || !employeeTaxBenefitData.name || !employeeTaxBenefitData.type || !employeeTaxBenefitData.value) {
            return next(new ErrorResponse('Todos os campos obrigatórios devem ser preenchidos: employee, name, type, value.', 400));
        }

        // Verificar se o funcionário existe
        const employeeExists = await Employee.findById(employeeTaxBenefitData.employee);
        if (!employeeExists) {
            console.log('Funcionário não encontrado com ID:', employeeTaxBenefitData.employee);
            return next(new ErrorResponse(`Funcionário não encontrado com ID: ${employeeTaxBenefitData.employee}`, 404));
        }

        // Verificar se o benefício já existe
        const existingBenefit = await EmployeeTaxBenefit.findOne({ name: employeeTaxBenefitData.name });
        if (existingBenefit) {
            return next(new ErrorResponse(`Benefício com o nome "${employeeTaxBenefitData.name}" já existe.`, 400));
        }

        const employeeTaxBenefit = await EmployeeTaxBenefit.create(employeeTaxBenefitData);

        logger.logBusiness('employee_tax_benefit_created', {
            employeeTaxBenefitId: employeeTaxBenefit._id
        });

        res.status(201).json({
            success: true,
            data: employeeTaxBenefit,
            message: 'Imposto ou benefício criado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar imposto ou benefício. Verifique os dados fornecidos.', 500));
    }
});

// Obter todos os impostos e benefícios com paginação, filtragem, ordenação e população
exports.getAllEmployeeTaxBenefits = asyncHandler(async (req, res, next) => {
    try {
        const { page = 1, limit = 10, employeeId, name, sortBy, sortOrder } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};
        if (employeeId) {
            filter.employeeId = employeeId;
        }
        if (name) {
            filter.name = { $regex: name, $options: 'i' };
        }

        const sort = {};
        if (sortBy) {
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        }

        const employeeTaxBenefits = await EmployeeTaxBenefit.find(filter)
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .populate('employee', 'name position') // Only include name and position of the employee

        const total = await EmployeeTaxBenefit.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: employeeTaxBenefits.map(benefit => ({
                id: benefit._id,
                name: benefit.name,
                value: benefit.value,
                isActive: benefit.isActive,
                employee: benefit.employee // This will only include the populated fields
            })),
            pagination: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar todos os impostos e benefícios', 500));
    }
});

// Obter um imposto ou benefício por ID
exports.getEmployeeTaxBenefitById = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        const employeeTaxBenefit = await EmployeeTaxBenefit.findById(id).populate('employee', 'name position');
        if (!employeeTaxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        res.status(200).json({
            success: true,
            data: employeeTaxBenefit
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar imposto ou benefício', 500));
    }
});

// Atualizar um imposto ou benefício
exports.updateEmployeeTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        const employeeTaxBenefitData = req.body;

        // Verificar se o benefício existe
        const employeeTaxBenefit = await EmployeeTaxBenefit.findById(id);
        if (!employeeTaxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        // Verificar se o funcionário existe
        if (employeeTaxBenefitData.employeeId) {
            const employeeExists = await Employee.findById(employeeTaxBenefitData.employeeId);
            if (!employeeExists) {
                return next(new ErrorResponse(`Funcionário não encontrado com ID: ${employeeTaxBenefitData.employeeId}`, 404));
            }
        }

        // Atualizar o benefício
        const updatedEmployeeTaxBenefit = await EmployeeTaxBenefit.findByIdAndUpdate(id, employeeTaxBenefitData, { new: true, runValidators: true });

        logger.logBusiness('employee_tax_benefit_updated', {
            employeeTaxBenefitId: updatedEmployeeTaxBenefit._id,
            updatedFields: employeeTaxBenefitData
        });

        res.status(200).json({
            success: true,
            data: updatedEmployeeTaxBenefit,
            message: 'Imposto ou benefício atualizado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar imposto ou benefício. Verifique os dados fornecidos.', 500));
    }
});

// Deletar um imposto ou benefício
exports.deleteEmployeeTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        const employeeTaxBenefit = await EmployeeTaxBenefit.findById(id);
        if (!employeeTaxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        await employeeTaxBenefit.remove();

        logger.logBusiness('employee_tax_benefit_deleted', {
            employeeTaxBenefitId: employeeTaxBenefit._id
        });

        res.status(200).json({
            success: true,
            message: 'Imposto ou benefício deletado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao deletar imposto ou benefício', 500));
    }
});