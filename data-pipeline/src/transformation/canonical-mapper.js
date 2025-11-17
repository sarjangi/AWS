// src/transformation/canonical-mapper.js - FIXED COMMONJS VERSION
const Joi = require('joi');

// FLEXIBLE validation schema
const sourceDataSchema = Joi.object({
    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    name: Joi.string().min(1).max(255).optional(),
    company_name: Joi.string().min(1).max(255).optional(),
    business_name: Joi.string().min(1).max(255).optional(),
    businessName: Joi.string().min(1).max(255).optional(),
    revenue: Joi.number().min(0).optional(),
    annual_revenue: Joi.number().min(0).optional(),
    employees: Joi.number().min(0).optional(),
    employee_count: Joi.number().min(0).optional(),
}).unknown(true);

class CanonicalMapper {
    constructor() {
        // FIX: Remove .bind(this) - just reference the methods directly
        this.mappings = {
            'crm-system': this.mapCRMData,
            'erp-system': this.mapERPData,
            'legacy-system': this.mapLegacyData
        };
    }

    async mapToCanonical(sourceData, sourceSystem) {
        const { error } = sourceDataSchema.validate(sourceData, { allowUnknown: true });
        if (error) {
            throw new Error(`Data validation failed: ${error.details[0].message}`);
        }

        const hasName = sourceData.name || sourceData.company_name || 
                       sourceData.business_name || sourceData.businessName;
        if (!hasName) {
            throw new Error('No name field found');
        }

        const mapper = this.mappings[sourceSystem];
        if (!mapper) {
            throw new Error(`No mapper found for source system: ${sourceSystem}`);
        }

        // FIX: Call the method directly
        const canonical = await mapper.call(this, sourceData);
        
        canonical.metadata = {
            source_id: sourceData.id,
            extraction_date: new Date().toISOString(),
            data_quality: this.calculateDataQuality(sourceData),
            transformation_version: '1.0.0',
        };

        return canonical;
    }

    mapCRMData(data) {
        const name = data.company_name || data.business_name || data.name;
        
        return {
            entity_type: this.determineEntityType(data),
            source_system: 'crm-system',
            canonical_id: `crm_${data.id}`,
            attributes: {
                name: name,
                revenue: data.annual_revenue || data.revenue,
                employees: data.employee_count || data.employees,
                industry: data.industry_code || data.industry,
            },
            status: 'active'
        };
    }

    mapERPData(data) {
        const name = data.businessName || data.company_name || data.name;
        
        return {
            entity_type: this.determineEntityType(data),
            source_system: 'erp-system',
            canonical_id: `erp_${data.id}`,
            attributes: {
                name: name,
                revenue: data.financials?.annualRevenue || data.revenue,
                employees: data.hrData?.employeeCount || data.employees,
                industry: data.sector || data.industry,
            },
            status: 'active'
        };
    }

    mapLegacyData(data) {
        return {
            entity_type: 'business_entity',
            source_system: 'legacy-system',
            canonical_id: `legacy_${data.id}`,
            attributes: {
                name: data.name,
                revenue: data.revenue,
                employees: data.employees,
                industry: data.industry,
            },
            status: 'active'
        };
    }

    determineEntityType(data) {
        const revenue = data.annual_revenue || data.revenue || data.financials?.annualRevenue || 0;
        const employees = data.employee_count || data.employees || data.hrData?.employeeCount || 0;

        if (revenue > 10000000 || employees > 1000) return 'large_enterprise';
        if (revenue > 1000000 || employees > 100) return 'medium_business';
        return 'small_business';
    }

    calculateDataQuality(data) {
        const requiredFields = ['id'];
        const nameFields = ['name', 'company_name', 'business_name', 'businessName'];
        
        const hasId = data.id != null;
        const hasName = nameFields.some(field => data[field] != null);
        
        let score = 0;
        if (hasId) score += 50;
        if (hasName) score += 50;
        
        const revenue = data.annual_revenue || data.revenue;
        const employees = data.employee_count || data.employees;
        
        if (revenue && revenue < 0) score -= 25;
        if (employees && employees < 0) score -= 25;
        
        return Math.max(0, score);
    }
}

module.exports = { CanonicalMapper };