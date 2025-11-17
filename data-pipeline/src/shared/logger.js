const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: {
        service: 'analytics-service',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        })
    ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
    logger.add(new transports.File({ 
        filename: 'logs/analytics-service-error.log', 
        level: 'error' 
    }));
    logger.add(new transports.File({ 
        filename: 'logs/analytics-service-combined.log' 
    }));
}

module.exports = logger;