// test-local.js - FIXED TEST DATA
import { CanonicalMapper } from './src/transformation/canonical-mapper.js';

// CORRECTED Test data - added missing "name" field
const testData = [
    {
        id: 1,
        name: "Tech Corporation",  // 🆕 ADDED THIS REQUIRED FIELD
        company_name: "Tech Corp",
        annual_revenue: 1000000,
        employee_count: 50,
        industry_code: "TECH"
    },
    {
        id: 2, 
        name: "Retail Incorporated",  // 🆕 ADDED THIS REQUIRED FIELD
        business_name: "Retail Inc",
        revenue: 500000,
        employees: 25,
        industry: "RETL"
    },
    {
        id: 3,
        name: "ERP Solutions Ltd",  // 🆕 ADDED THIS REQUIRED FIELD
        businessName: "ERP Company", 
        financials: { annualRevenue: 2000000 },
        hrData: { employeeCount: 150 },
        sector: "MANUFACTURING"
    }
];

async function testLocal() {
    console.log("🧪 Testing data transformation locally...");
    
    try {
        // Test the mapper
        const mapper = new CanonicalMapper();
        console.log('✅ Mapper initialized successfully');
        
        // Test CRM system
        console.log('\n📊 Testing CRM system mapping:');
        const crmData = await mapper.mapToCanonical(testData[0], 'crm-system');
        console.log('✅ CRM mapping successful');
        console.log('   Entity Type:', crmData.entity_type);
        console.log('   Canonical ID:', crmData.canonical_id);
        console.log('   Revenue:', crmData.attributes.revenue);
        console.log('   Data Quality:', crmData.metadata.data_quality);
        
        // Test ERP system  
        console.log('\n📊 Testing ERP system mapping:');
        const erpData = await mapper.mapToCanonical(testData[2], 'erp-system');
        console.log('✅ ERP mapping successful');
        console.log('   Entity Type:', erpData.entity_type);
        console.log('   Canonical ID:', erpData.canonical_id);
        console.log('   Employees:', erpData.attributes.employees);
        
        // Test data quality with bad data
        console.log('\n📊 Testing data validation:');
        try {
            const badData = { id: 99 }; // Missing required "name" field
            await mapper.mapToCanonical(badData, 'crm-system');
        } catch (error) {
            console.log('✅ Correctly caught invalid data:', error.message);
        }
        
    } catch (error) {
        console.log('❌ Test failed:', error.message);
    }
    
    console.log("\n🎉 All tests completed!");
}

testLocal();