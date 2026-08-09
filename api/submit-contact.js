/* eslint-env node */
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const {
        companyName,
        isAgency,
        industry,
        location,
        phone,
        website,
        budget,
        message,
        privacyAgreement, // Required by form, but Airtable "Privacy Agreement" field will receive boolean
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content
    } = req.body;

    // ⚠️ 키를 코드에 넣지 않는다. 2026-04-06 ~ 08-09 넉 달간 공개 저장소에 노출됐다.
    //    환경변수가 없으면 조용히 옛 키로 도는 게 아니라, 실패하고 알리는 쪽이 맞다.
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_NAME = 'Inbound Leads'; // Fixed table name as per user creation

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        console.error('Missing Airtable Credentials');
        return res.status(500).json({ message: 'Server Configuration Error' });
    }

    // Construct Airtable Payload
    // Mapping React State Keys -> Airtable Field Names
    const fields = {
        'Company Name': companyName,
        'Is Agency': isAgency ? 'Yes' : 'No', // Ensures string format for Airtable Single Line Text column
        'Industry': industry,
        'Location': location,
        'Phone': phone,
        'Website': website || '',
        'Budget': budget || '',
        'Message': message || '',
        'Privacy Agreement': privacyAgreement ? 'Yes' : 'No',
        // Tracking Fields - Only send if they exist to keep data clean
        ...(utm_source && { 'UTM Source': utm_source }),
        ...(utm_medium && { 'UTM Medium': utm_medium }),
        ...(utm_campaign && { 'UTM Campaign': utm_campaign }),
        ...(utm_term && { 'UTM Term': utm_term }),       // Optional if you added it
        ...(utm_content && { 'UTM Content': utm_content }) // Optional if you added it
    };

    try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: fields,
                typecast: true // CRITICAL: Allows creating new Select options if they don't exist
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Airtable API Error:', data);
            return res.status(response.status).json({ message: 'Failed to save to Airtable', error: data });
        }

        return res.status(200).json({ success: true, id: data.id });

    } catch (error) {
        console.error('Server Internal Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
