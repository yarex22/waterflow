<template>
  <!-- No changes to template section -->
</template>

<script>
import api from '../../services/api';
import notify from '../../utils/notify';

export default {
  methods: {
    async updateExpense() {
      try {
        // 1. Validação inicial
        if (!this.validateForm()) {
          notify({
            title: "Atenção",
            text: "Por favor, preencha todos os campos obrigatórios.",
            type: "warning"
          });
          return;
        }

        // 2. Controle de estado
        this.isSubmitting = true;

        // 3. Preparação dos dados
        const formData = this.prepareFormData();
        const user = JSON.parse(localStorage.getItem('user'));
        const token = localStorage.getItem('token');
        const expenseId = this.$route.query.id;

        // 4. Validações de segurança
        if (!token) {
          throw new Error('Usuário não autenticado');
        }

        if (!expenseId) {
          throw new Error('ID da despesa não fornecido');
        }

        // 5. Adicionar companyId se disponível
        const companyId = user?.company?.id || user?.company?._id || user?.company;
        if (companyId) {
          formData.append('companyId', companyId);
        }

        // 6. Fazer a requisição
        const response = await api.put(`/expense/update/${expenseId}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'token': token
          }
        });

        // 7. Validar resposta
        if (response.status === 200 && response.data) {
          // 8. Sucesso
          notify({
            title: "Sucesso",
            text: response.data.message || "Despesa atualizada com sucesso!",
            type: "success"
          });

          // 9. Redirecionar
          await this.$router.push('/despesas');
        } else {
          throw new Error(response.data?.message || 'Erro ao atualizar despesa');
        }
      } catch (error) {
        // 10. Tratamento de erros específicos
        console.error('Erro ao atualizar despesa:', error);
        
        let errorMessage = "Erro ao atualizar despesa.";
        
        if (error.response) {
          // Erro da API
          errorMessage = error.response.data?.message || errorMessage;
        } else if (error.message) {
          // Erro de validação ou outro erro conhecido
          errorMessage = error.message;
        }

        notify({
          title: "Erro",
          text: errorMessage,
          type: "error"
        });
      } finally {
        // 11. Limpeza
        this.isSubmitting = false;
      }
    },

    // Método auxiliar para validar o formulário
    validateForm() {
      // Validar campos obrigatórios
      if (!this.expense.description?.trim()) {
        return false;
      }
      if (!this.expense.amount || this.expense.amount <= 0) {
        return false;
      }
      if (!this.expense.category) {
        return false;
      }
      if (!this.expense.date) {
        return false;
      }
      return true;
    },

    // Método auxiliar para preparar o FormData
    prepareFormData() {
      const formData = new FormData();
      
      // Adicionar campos básicos
      formData.append('description', this.expense.description.trim());
      formData.append('amount', this.expense.amount);
      formData.append('category', this.expense.category);
      formData.append('date', this.expense.date);
      
      // Adicionar campos opcionais
      if (this.expense.notes?.trim()) {
        formData.append('notes', this.expense.notes.trim());
      }
      
      if (this.expense.kw) {
        formData.append('kw', this.expense.kw);
      }
      
      // Adicionar arquivo se houver
      if (this.selectedFile) {
        formData.append('attachment', this.selectedFile);
      }
      
      return formData;
    }
  }
};
</script>

<style>
  /* No changes to style section */
</style> 