const mongoose = require('mongoose');
const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const Salary = require('../../../models/waterflow/salary/SalaryModel');
const Employee = require('../../../models/waterflow/employee/EmployeeModel');
const TaxBenefit = require('../../../models/waterflow/taxBenefit/TaxBenefitModel');
const EmployeeTaxBenefit = require('../../../models/waterflow/employeeTaxBenefit/EmployeeTaxBenefitModel');

exports.createMonthlySalaries = asyncHandler(async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { salaries } = req.body;

        if (!Array.isArray(salaries) || salaries.length === 0) {
            return next(new ErrorResponse('Um array de salários é obrigatório', 400));
        }

        const createdSalaries = [];

        for (const salaryData of salaries) {
            const { employeeId, baseSalary, month } = salaryData;

            if (!employeeId || !baseSalary || !month) {
                return next(new ErrorResponse('Campos obrigatórios ausentes', 400));
            }

            const employee = await Employee.findById(employeeId).populate('company');
            if (!employee) {
                return next(new ErrorResponse(`Funcionário ${employeeId} não encontrado`, 404));
            }

            // Buscar Taxas/Benefícios Globais e Individuais
            const globalItems = await TaxBenefit.find({});
            const individualItems = await EmployeeTaxBenefit.find({ employee: employeeId, isActive: true });

            let totalTaxes = 0;
            let totalBenefits = 0;
            let details = [];

            const allItems = [
                ...globalItems.map(item => ({ ...item.toObject(), source: 'Global' })),
                ...individualItems.map(item => ({ ...item.toObject(), source: 'Individual' }))
            ];

            for (const item of allItems) {
                const { name, type, percentage, fixedValue, value, valueType, source } = item;

                // Suporte tanto para TaxBenefit quanto EmployeeTaxBenefit
                const valueTypeFinal = valueType || (percentage > 0 ? 'Percentage' : 'Fixed');
                const valueFinal = value ?? fixedValue ?? percentage;

                let amount = 0;

                if (valueTypeFinal === 'Percentage') {
                    amount = (baseSalary * valueFinal) / 100;
                } else {
                    amount = valueFinal;
                }

                if (type === 'Tax') totalTaxes += amount;
                if (type === 'Benefit') totalBenefits += amount;

                details.push({
                    name,
                    type,
                    source,
                    valueType: valueTypeFinal,
                    value: valueFinal,
                    amount
                });
            }

            const netSalary = baseSalary + totalBenefits - totalTaxes;

            const salary = await Salary.create([{
                employee: employeeId,
                company: employee.company,
                baseSalary,
                totalTaxes,
                totalBenefits,
                netSalary,
                details,
                month
            }], { session });

            createdSalaries.push(salary[0]);
        }

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            data: createdSalaries,
            message: 'Salários criados com sucesso'
        });

    } catch (error) {
        await session.abortTransaction();
        next(new ErrorResponse('Erro ao criar salários', 500));
    } finally {
        session.endSession();
    }
});

// Método para obter salários com paginação e validação
exports.getSalaries = asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role !== 'admin') {
        query.company = req.user.company;
    }

    const salaries = await Salary.find(query)
        .populate('employee company')
        .skip(skip)
        .limit(limit);

    const totalSalaries = await Salary.countDocuments();

    res.status(200).json({
        success: true,
        data: salaries,
        pagination: {
            total: totalSalaries,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(totalSalaries / limit),
        },
    });
});

// Método para atualizar salários com validação
exports.updateSalary = asyncHandler(async (req, res, next) => {
    const { salaries } = req.body;
    const { id } = req.params;

    if (!Array.isArray(salaries) || salaries.length === 0) {
        return next(new ErrorResponse('Um array de salários é obrigatório', 400));
    }

    const updatedSalaries = [];

    for (const salaryData of salaries) {
        const { employeeId, baseSalary, month } = salaryData;

        if (!employeeId || !baseSalary || !month) {
            return next(new ErrorResponse('Campos obrigatórios ausentes', 400));
        }

        const salary = await Salary.findByIdAndUpdate(id, { baseSalary, month }, { new: true });

        if (!salary) {
            return next(new ErrorResponse(`Salário com ID ${id} não encontrado`, 404));
        }

        updatedSalaries.push(salary);
    }

    res.status(200).json({
        success: true,
        data: updatedSalaries,
    });
});

// Método para deletar um salário com validação
exports.deleteSalary = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const salary = await Salary.findByIdAndDelete(id);

    if (!salary) {
        return next(new ErrorResponse(`Salário com ID ${id} não encontrado`, 404));
    }

    res.status(204).json({
        success: true,
        data: null,
    });
});

// Método para obter salários por empresa com filtros, ordenação e paginação
exports.getSalariesByCompany = asyncHandler(async (req, res, next) => {
    const { companyId } = req.params;
    const {
        pageSize = 10,
        pageNumber = 1,
        sortBy = 'month', // ou outro campo que você deseja usar para ordenação
        sortOrder = 'asc',
        searchTerm
    } = req.query;

    if (!companyId) {
        return next(new ErrorResponse('O ID da empresa é obrigatório', 400));
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return next(new ErrorResponse('ID da empresa inválido', 400));
    }

    // Construir query
    const query = { company: companyId };

    // Adicionar critérios de busca
    if (searchTerm) {
        query.$or = [
            { 'employee.name': { $regex: searchTerm, $options: 'i' } },
            { month: { $regex: searchTerm, $options: 'i' } }
        ];
    }

    // Validar campo de ordenação
    const validSortFields = ['month', 'netSalary', 'baseSalary', 'totalTaxes', 'totalBenefits'];
    if (!validSortFields.includes(sortBy)) {
        return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Salary.countDocuments(query);

    // Buscar salários com paginação e incluir conexões
    const salaries = await Salary.find(query)
        .populate('employee company')
        .sort(sortOptions)
        .skip((pageNumber - 1) * pageSize)
        .limit(parseInt(pageSize))
        .lean();

    if (salaries.length === 0) {
        return next(new ErrorResponse('Nenhum salário encontrado para esta empresa', 404));
    }

    res.status(200).json({
        success: true,
        data: salaries,
        pagination: {
            total: totalCount,
            pageSize: parseInt(pageSize),
            currentPage: parseInt(pageNumber),
            totalPages: Math.ceil(totalCount / pageSize)
        }
    });
});

// Método para obter um salário por ID
exports.getSalaryById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new ErrorResponse('ID do salário inválido', 400));
    }

    const salary = await Salary.findById(id).populate('employee company');

    if (!salary) {
        return next(new ErrorResponse(`Salário com ID ${id} não encontrado`, 404));
    }

    res.status(200).json({
        success: true,
        data: salary,
    });
});
