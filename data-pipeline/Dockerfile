# Dockerfile (in data-pipeline/ folder)
FROM public.ecr.aws/lambda/nodejs:18

# Copy package files from root
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code from src folder
COPY src/ ./

# Set the Lambda handler
CMD ["ingestion/data-processor.handler"]