<template>
    <div class="payment-update">
        <div class="card">
            <div class="card-header">
                <h3>Atualizar Pagamento</h3>
            </div>
            <div class="card-body">
                <form @submit.prevent="updatePayment" class="form">
                    <!-- Valor -->
                    <div class="form-group">
                        <label>Valor*</label>
                        <input 
                            type="number" 
                            v-model="payment.amount" 
                            class="form-control" 
                            step="0.01"
                            min="0.01"
                            :disabled="isSubmitting"
                            required
                        >
                    </div>

                    <!-- Método de Pagamento -->
                    <div class="form-group">
                        <label>Método de Pagamento*</label>
                        <select 
                            v-model="payment.method" 
                            class="form-control"
                            :disabled="isSubmitting"
                            required
                        >
                            <option value="">Selecione...</option>
                            <option value="Dinheiro">Dinheiro</option>
                            <option value="PIX">PIX</option>
                            <option value="Cartão">Cartão</option>
                            <option value="Transferência">Transferência</option>
                        </select>
                    </div>

                    <!-- Referência -->
                    <div class="form-group">
                        <label>Referência</label>
                        <input 
                            type="text" 
                            v-model="payment.reference" 
                            class="form-control"
                            :disabled="isSubmitting"
                        >
                    </div>

                    <!-- Observações -->
                    <div class="form-group">
                        <label>Observações</label>
                        <textarea 
                            v-model="payment.notes" 
                            class="form-control"
                            :disabled="isSubmitting"
                        ></textarea>
                    </div>

                    <!-- Botões -->
                    <div class="form-actions">
                        <button 
                            type="button" 
                            class="btn btn-secondary" 
                            @click="$router.push('/pagamentos')"
                            :disabled="isSubmitting"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            class="btn btn-primary" 
                            :disabled="isSubmitting"
                        >
                            {{ isSubmitting ? 'Atualizando...' : 'Atualizar' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<script>
import api from '../../services/api';
import notify from '../../utils/notify';

export default {
    name: 'UpdatePayment',
    
    data() {
        return {
            payment: {
                amount: 0,
                method: '',
                reference: '',
                notes: ''
            },
            isSubmitting: false,
            originalPayment: null
        };
    },

    async created() {
        await this.loadPayment();
    },

    methods: {
        async loadPayment() {
            try {
                const paymentId = this.$route.query.id;
                if (!paymentId) {
                    throw new Error('ID do pagamento não fornecido');
                }

                const token = localStorage.getItem('token');
                if (!token) {
                    throw new Error('Usuário não autenticado');
                }

                const response = await api.get(`/payment/single/${paymentId}`, {
                    headers: { token }
                });

                if (response.data?.success) {
                    const paymentData = response.data.data;
                    this.payment = {
                        amount: paymentData.amount,
                        method: paymentData.method,
                        reference: paymentData.reference || '',
                        notes: paymentData.notes || ''
                    };
                    this.originalPayment = { ...this.payment };
                } else {
                    throw new Error('Erro ao carregar dados do pagamento');
                }
            } catch (error) {
                console.error('Erro ao carregar pagamento:', error);
                notify({
                    title: "Erro",
                    text: error.response?.data?.message || error.message || "Erro ao carregar pagamento",
                    type: "error"
                });
                this.$router.push('/pagamentos');
            }
        },

        async updatePayment() {
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

                // 2. Verificar se houve alterações
                if (this.isUnchanged()) {
                    notify({
                        title: "Atenção",
                        text: "Nenhuma alteração foi feita.",
                        type: "warning"
                    });
                    return;
                }

                // 3. Controle de estado
                this.isSubmitting = true;

                // 4. Preparação dos dados
                const paymentData = this.preparePaymentData();
                const token = localStorage.getItem('token');
                const paymentId = this.$route.query.id;

                // 5. Validações de segurança
                if (!token) {
                    throw new Error('Usuário não autenticado');
                }

                if (!paymentId) {
                    throw new Error('ID do pagamento não fornecido');
                }

                // 6. Fazer a requisição
                const response = await api.put(`/payment/update/${paymentId}`, paymentData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'token': token
                    }
                });

                // 7. Validar resposta
                if (response.status === 200 && response.data) {
                    // 8. Sucesso
                    notify({
                        title: "Sucesso",
                        text: response.data.message || "Pagamento atualizado com sucesso!",
                        type: "success"
                    });

                    // 9. Redirecionar
                    await this.$router.push('/pagamentos');
                } else {
                    throw new Error(response.data?.message || 'Erro ao atualizar pagamento');
                }
            } catch (error) {
                // 10. Tratamento de erros específicos
                console.error('Erro ao atualizar pagamento:', error);
                
                let errorMessage = "Erro ao atualizar pagamento.";
                
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

        validateForm() {
            // Validar campos obrigatórios
            if (!this.payment.amount || this.payment.amount <= 0) {
                return false;
            }
            if (!this.payment.method) {
                return false;
            }
            return true;
        },

        isUnchanged() {
            return JSON.stringify(this.payment) === JSON.stringify(this.originalPayment);
        },

        preparePaymentData() {
            return {
                amount: Number(this.payment.amount),
                method: this.payment.method,
                reference: this.payment.reference.trim(),
                notes: this.payment.notes.trim()
            };
        }
    }
};
</script>

<style scoped>
.payment-update {
    padding: 20px;
}

.card {
    max-width: 800px;
    margin: 0 auto;
}

.form-group {
    margin-bottom: 1rem;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
}
</style> 