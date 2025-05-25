const Department = require('../../../models/waterflow/department/DepartmentModel');
const Employee = require('../../../models/waterflow/employee/EmployeeModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Criar departamento
exports.createDepartment = asyncHandler(async (req, res, next) => {
  try {
    const { name, description, head } = req.body;

    // Validação dos campos obrigatórios
    if (!name) {
      return next(new ErrorResponse('Nome, descrição e chefe do departamento são obrigatórios', 400));
    }

    // Verificar se o funcionário (head) existe
    // const employeeExists = await Employee.findById(head);
    // if (!employeeExists) {
    //   return next(new ErrorResponse('Funcionário não encontrado', 404));
    // }

    // Verificar duplicidade
    const existingDepartment = await Department.findOne({ name: name.trim() });
    if (existingDepartment) {
      return next(new ErrorResponse('Já existe um departamento com este nome', 409));
    }

    // Criar departamento
    const department = await Department.create({
      name: name.trim(),
      description: description.trim(),
      head
    });

    logger.logBusiness('department_created', {
      departmentId: department._id,
      name: department.name,
      head: department.head
    });

    res.status(201).json({
      success: true,
      data: department,
      message: 'Departamento criado com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar departamento', 500));
  }
});

// Buscar departamento por ID
exports.getDepartmentById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de departamento inválido', 400));
    }

    const department = await Department.findById(id)
      .select('-__v')
      .populate('head', 'name position email');

    if (!department) {
      return next(new ErrorResponse('Departamento não encontrado', 404));
    }

    // Contar funcionários associados
    const employeesCount = await Employee.countDocuments({ department: id });

    logger.logBusiness('department_viewed', {
      departmentId: department._id,
      name: department.name
    });

    res.status(200).json({
      success: true,
      data: {
        ...department.toObject(),
        employeesCount
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar departamento', 500));
  }
});

// Listar todos os departamentos
exports.getAllDepartments = asyncHandler(async (req, res, next) => {
  try {
    const { 
      pageSize = 10, 
      pageNumber = 1, 
      searchTerm,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Construir query
    const query = {};

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Department.countDocuments(query);

    // Buscar departamentos com paginação
    const departments = await Department.find(query)
      .select('-__v')
      .populate('head', 'name position email')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    // Buscar contagem de funcionários para cada departamento
    const departmentsWithStats = await Promise.all(
      departments.map(async (department) => {
        const employeesCount = await Employee.countDocuments({ department: department._id });
        return {
          ...department.toObject(),
          employeesCount
        };
      })
    );

    logger.logBusiness('departments_listed', {
      page: pageNumber,
      pageSize,
      totalCount,
      searchTerm: searchTerm || 'none'
    });

    res.status(200).json({
      success: true,
      data: departmentsWithStats,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar departamentos', 500));
  }
});

// Atualizar departamento
exports.updateDepartment = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, head } = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de departamento inválido', 400));
    }

    // Verificar se o departamento existe
    const existingDepartment = await Department.findById(id);
    if (!existingDepartment) {
      return next(new ErrorResponse('Departamento não encontrado', 404));
    }

    // Validar campos obrigatórios
    // if (!name || !description || !head) {
    //   return next(new ErrorResponse('Nome, descrição e chefe do departamento são obrigatórios', 400));
    // }

    // // Verificar se o funcionário (head) existe
    // const employeeExists = await Employee.findById(head);
    // if (!employeeExists) {
    //   return next(new ErrorResponse('Funcionário não encontrado', 404));
    // }

    // Verificar duplicidade (excluindo o departamento atual)
    const duplicateCheck = await Department.findOne({
      _id: { $ne: id },
      name: name.trim()
    });

    if (duplicateCheck) {
      return next(new ErrorResponse('Já existe outro departamento com este nome', 409));
    }

    // Atualizar departamento
    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description.trim(),
        head,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-__v');

    logger.logBusiness('department_updated', {
      departmentId: updatedDepartment._id,
      changes: {
        before: {
          name: existingDepartment.name,
          description: existingDepartment.description,
          head: existingDepartment.head
        },
        after: {
          name: updatedDepartment.name,
          description: updatedDepartment.description,
          head: updatedDepartment.head
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedDepartment,
      message: 'Departamento atualizado com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar departamento', 500));
  }
});

// Deletar departamento
exports.deleteDepartment = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de departamento inválido', 400));
    }

    // Verificar se o departamento existe
    const department = await Department.findById(id);
    if (!department) {
      return next(new ErrorResponse('Departamento não encontrado', 404));
    }

    // Verificar se existem funcionários associados
    const employeesCount = await Employee.countDocuments({ department: id });
    if (employeesCount > 0) {
      return next(new ErrorResponse(
        'Não é possível excluir o departamento pois existem funcionários vinculados',
        400
      ));
    }

    // Registrar informações antes de deletar
    const departmentInfo = {
      id: department._id,
      name: department.name,
      description: department.description,
      head: department.head,
      deletedAt: new Date()
    };

    // Deletar departamento
    await Department.findByIdAndDelete(id);

    logger.logBusiness('department_deleted', departmentInfo);

    res.status(200).json({
      success: true,
      message: 'Departamento removido com sucesso',
      data: departmentInfo
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover departamento', 500));
  }
});

// Buscar estatísticas dos departamentos
exports.getDepartmentsStats = asyncHandler(async (req, res, next) => {
  try {
    // Buscar todos os departamentos
    const departments = await Department.find()
      .select('-__v')
      .populate('head', 'name position email');

    // Calcular estatísticas para cada departamento
    const stats = await Promise.all(
      departments.map(async (department) => {
        const employeesCount = await Employee.countDocuments({ department: department._id });
        
        return {
          _id: department._id,
          name: department.name,
          description: department.description,
          head: department.head,
          stats: {
            employeesCount,
            // Adicione mais estatísticas aqui conforme necessário
          }
        };
      })
    );

    logger.logBusiness('departments_stats_viewed', {
      totalDepartments: departments.length
    });

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar estatísticas dos departamentos', 500));
  }
});
