const Employee = require('../../../models/waterflow/employee/EmployeeModel');
const Salary = require('../../../models/waterflow/salary/SalaryModel');
const Department = require('../../../models/waterflow/department/DepartmentModel');
const Company = require('../../../models/waterflow/company/CompanyModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Criar funcionário
exports.createEmployee = asyncHandler(async (req, res, next) => {
    // Log para depuração
    console.log('Dados recebidos:', req.body);

    // Obter dados da requisição
    const {
        name,
        position,
        department,
        company,
        contact,
        email,
        birthDate,
        salaryBase, // Removido da criação do funcionário
        salaryCurrency // Removido da criação do funcionário
    } = req.body;

    // Validação simplificada
    const requiredFields = ['name', 'position', 'department', 'company', 'contact', 'email', 'birthDate', 'salaryBase', 'salaryCurrency'];
    for (const field of requiredFields) {
        if (!req.body[field]) {
            return next(new ErrorResponse(`O campo ${field} é obrigatório`, 400));
        }
    }

    // Verificar se o departamento e a empresa existem
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
        return next(new ErrorResponse('Departamento não encontrado', 404));
    }

    const companyExists = await Company.findById(company);
    if (!companyExists) {
        return next(new ErrorResponse('Empresa não encontrada', 404));
    }

    // Validar formato de email
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed.includes('@')) {
        return next(new ErrorResponse('O email deve conter um "@"', 400));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
        return next(new ErrorResponse('Formato de email inválido', 400));
    }

    // Verificar se o nome ou email já existem
    const existingEmployeeByName = await Employee.findOne({ name: name.trim() });
    if (existingEmployeeByName) {
        return next(new ErrorResponse('Nome já cadastrado', 409));
    }

    const existingEmployeeByEmail = await Employee.findOne({ email: emailTrimmed });
    if (existingEmployeeByEmail) {
        return next(new ErrorResponse('Email já cadastrado', 409));
    }

    // Criar funcionário
    const employee = await Employee.create({
        name: name.trim(),
        position: position.trim(),
        department,
        company,
        contact: contact.trim(),
        email: emailTrimmed,
        birthDate,
        salaryBase,
        salaryCurrency,
        active: true, // Removido salárioBase e salaryCurrency
        currentSalary: null // Removido salárioBase e salaryCurrency
    });

    res.status(201).json({
        success: true,
        data: employee,
        message: 'Funcionário criado com sucesso'
    });
});

// Buscar funcionário por ID
exports.getEmployeeById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new ErrorResponse('ID de funcionário inválido', 400));
    }

    const employee = await Employee.findById(id)
        .populate('department', 'name description')
        .populate('company', 'name');

    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    res.status(200).json({
        success: true,
        data: employee
    });
});

// Listar todos os funcionários
exports.getAllEmployees = asyncHandler(async (req, res, next) => {
    try {
        const {
            pageSize = 10,
            pageNumber = 1,
            searchTerm,
            sortBy = 'name',
            sortOrder = 'asc',
            department,
            company,
            status,
            minSalary,
            maxSalary
        } = req.query;

        // Construir query base
        let query = {};

        // Adicionar critérios de busca
        if (searchTerm) {
            query.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { position: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } },
                { contact: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Filtrar por departamento
        if (department) {
            if (!mongoose.Types.ObjectId.isValid(department)) {
                logger.logBusiness('employee_list_failed', {
                    reason: 'invalid_department_id',
                    department
                });
                return next(new ErrorResponse('ID do departamento inválido', 400));
            }
            query.department = department;
        }

        // Filtrar por empresa
        if (company) {
            if (!mongoose.Types.ObjectId.isValid(company)) {
                logger.logBusiness('employee_list_failed', {
                    reason: 'invalid_company_id',
                    company
                });
                return next(new ErrorResponse('ID da empresa inválido', 400));
            }
            query.company = company;
        }

        // Filtrar por status
        if (status) {
            const validStatus = ['Ativo', 'Inativo'];
            if (!validStatus.includes(status)) {
                logger.logBusiness('employee_list_failed', {
                    reason: 'invalid_status',
                    status
                });
                return next(new ErrorResponse('Status inválido', 400));
            }
            query.active = status === 'Ativo';
        }

        // Filtrar por faixa salarial (apenas para admin/manager)
        if ((minSalary || maxSalary) && req.user && ['admin', 'manager'].includes(req.user.role)) {
            query['salary.base'] = {};
            if (minSalary) query['salary.base'].$gte = Number(minSalary);
            if (maxSalary) query['salary.base'].$lte = Number(maxSalary);
        }

        // Executar query sem população para currentSalary
        const total = await Employee.countDocuments(query);
        const employees = await Employee.find(query)
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
            .populate('department', 'name')
            .populate('company', 'name');

        logger.logBusiness('employees_listed', {
            filters: {
                searchTerm: searchTerm || 'none',
                department: department || 'all',
                company: company || 'all',
                status: status || 'all',
                salaryRange: minSalary && maxSalary ? `${minSalary} to ${maxSalary}` : 'all'
            },
            pagination: {
                page: pageNumber,
                pageSize,
                totalCount: total,
                totalPages: Math.ceil(total / pageSize)
            }
        });

        res.status(200).json({
            success: true,
            data: employees,
            pagination: {
                total: total,
                pageSize: Number(pageSize),
                currentPage: Number(pageNumber),
                totalPages: Math.ceil(total / pageSize)
            }
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao listar funcionários', 500));
    }
});

// Atualizar funcionário
exports.updateEmployee = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new ErrorResponse('ID de funcionário inválido', 400));
    }

    const existingEmployee = await Employee.findById(id);
    if (!existingEmployee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    // Validar email se estiver sendo atualizado
    if (updateData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updateData.email)) {
            return next(new ErrorResponse('Formato de email inválido', 400));
        }

        const duplicateEmail = await Employee.findOne({
            email: updateData.email.trim(),
            _id: { $ne: id }
        });
        if (duplicateEmail) {
            return next(new ErrorResponse('Email já cadastrado', 409));
        }
    }

    // Validar departamento se estiver sendo atualizado
    if (updateData.department) {
        if (!mongoose.Types.ObjectId.isValid(updateData.department)) {
            logger.logBusiness('employee_update_failed', {
                reason: 'invalid_department_id',
                department: updateData.department
            });
            return next(new ErrorResponse('ID do departamento inválido', 400));
        }

        const departmentExists = await Department.findById(updateData.department);
        if (!departmentExists) {
            logger.logBusiness('employee_update_failed', {
                reason: 'department_not_found',
                department: updateData.department
            });
            return next(new ErrorResponse('Departamento não encontrado', 404));
        }
    }

    // Atualizar funcionário
    const updatedEmployee = await Employee.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
    )
        .select('-__v')
        .populate('department', 'name description')
        .populate('company', 'name');

    logger.logBusiness('employee_updated', {
        employeeId: updatedEmployee._id,
        changes: {
            before: {
                name: existingEmployee.name,
                email: existingEmployee.email,
                position: existingEmployee.position,
                department: existingEmployee.department,
                company: existingEmployee.company,
                contact: existingEmployee.contact,
                active: existingEmployee.active
            },
            after: {
                name: updatedEmployee.name,
                email: updatedEmployee.email,
                position: updatedEmployee.position,
                department: updatedEmployee.department,
                company: updatedEmployee.company,
                contact: updatedEmployee.contact,
                active: updatedEmployee.active
            }
        }
    });

    res.status(200).json({
        success: true,
        data: updatedEmployee,
        message: 'Funcionário atualizado com sucesso'
    });
});

// Desativar funcionário
exports.deactivateEmployee = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new ErrorResponse('ID de funcionário inválido', 400));
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    employee.active = false;
    await employee.save();

    res.status(200).json({
        success: true,
        message: 'Funcionário desativado com sucesso'
    });
});

// Excluir funcionário
exports.deleteEmployee = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new ErrorResponse('ID de funcionário inválido', 400));
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    await Employee.findByIdAndDelete(id);

    res.status(200).json({
        success: true,
        message: 'Funcionário removido com sucesso'
    });
});

// Atualizar salário do funcionário
exports.updateEmployeeSalary = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { baseSalary } = req.body;

    // Verificar permissão
    if (!req.user || req.user.role !== 'admin') {
        return next(new ErrorResponse('Sem permissão para atualizar salário', 403));
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    // Atualizar salário
    employee.currentSalary.baseSalary = baseSalary;
    await employee.save();

    res.status(200).json({
        success: true,
        message: 'Salário atualizado com sucesso'
    });
});

// Obter histórico de salários
exports.getSalaryHistory = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    // Verificar permissão
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
        return next(new ErrorResponse('Sem permissão para visualizar histórico de salários', 403));
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    const salaryHistory = await employee.getSalaryHistory();

    res.status(200).json({
        success: true,
        data: salaryHistory
    });
});

// Atualizar salário base do funcionário
exports.updateBaseSalary = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { base: newBaseSalary } = req.body;

    // Verificar permissão
    if (!req.user || req.user.role !== 'admin') {
        return next(new ErrorResponse('Sem permissão para atualizar salário', 403));
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        return next(new ErrorResponse('Funcionário não encontrado', 404));
    }

    // Atualizar salário base
    employee.salary.base = newBaseSalary;
    await employee.save();

    res.status(200).json({
        success: true,
        message: 'Salário base atualizado com sucesso'
    });
});

// Obter funcionários ativos
exports.getActiveEmployees = asyncHandler(async (req, res, next) => {
    const activeEmployees = await Employee.find({ active: true })
        .populate('department', 'name description')
        .populate('company', 'name');

    res.status(200).json({
        success: true,
        data: activeEmployees
    });
});