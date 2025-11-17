// src/shared/aws-utils.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient();

async function getSecret(secretArn) {
    try {
        const command = new GetSecretValueCommand({ SecretId: secretArn });
        const response = await secretsClient.send(command);
        
        if (response.SecretString) {
            return JSON.parse(response.SecretString);
        }
        
        throw new Error('No secret string found');
    } catch (error) {
        console.error('Error retrieving secret:', error);
        throw error;
    }
}

module.exports = { getSecret };