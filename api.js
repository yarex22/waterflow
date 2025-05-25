import axios from 'axios';
import router from '@/router';
import AuthService from '@/services/auth.service';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'https://waterflow-jafo.onrender.com',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Access-Control-Allow-Origin': '*'
    },
    withCredentials: true
});

// Função para obter o token atualizado
const getAuthToken = () => localStorage.getItem('token');

// Interceptor de request
api.interceptors.request.use(
    config => {
        const token = getAuthToken();
        if (token) {
            config.headers['token'] = token;
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        // Adicionar timestamp para evitar cache
        if (config.method === 'get') {
            config.params = {
                ...config.params,
                _t: new Date().getTime()
            };
        }
        return config;
    },
    error => {
        console.error('Request Error:', error);
        return Promise.reject(error);
    }
);

// Interceptor de response
api.interceptors.response.use(
    response => {
        return response.data;
    },
    async error => {
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    // Unauthorized - Limpar dados e redirecionar para login
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    await AuthService.logout();
                    router.push('/login');
                    break;
                case 403:
                    // Forbidden
                    console.error('Acesso negado');
                    break;
                case 404:
                    // Not Found
                    console.error('Recurso não encontrado:', error.response.config.url);
                    break;
                case 429:
                    // Too Many Requests
                    console.error('Muitas requisições. Tente novamente mais tarde.');
                    break;
                case 500:
                    // Server Error
                    console.error('Erro interno do servidor');
                    break;
                default:
                    console.error('Erro na requisição:', error.message);
            }
        } else if (error.request) {
            // Erro de conexão
            console.error('Erro de conexão com o servidor');
        } else {
            console.error('Erro ao configurar requisição:', error.message);
        }
        return Promise.reject(error);
    }
);

// Configurar token inicial se existir
const token = localStorage.getItem('token');
if (token) {
    api.defaults.headers.common['token'] = token;
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export default api; 