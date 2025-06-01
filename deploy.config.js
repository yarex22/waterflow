module.exports = {
    apps: [{
        name: "waterflow-backend",
        script: "./app.js",        env: {
            NODE_ENV: "production",
            PORT: 3000,
            MONGODB_URI: "mongodb://admin:%23%40DocaSeca2535220@69.62.119.104:27017/waterflow?authSource=admin",
            JWT_SECRET: "your-jwt-secret",
            JWT_EXPIRE: "24h",
            CORS_ORIGIN: "http://69.62.119.104:8000"
        },
        instances: "max",
        exec_mode: "cluster",
        watch: false,
        max_memory_restart: "1G",
        env_production: {
            NODE_ENV: "production"
        }
    }]
}; 