-- Phase 3: Member Data Migration Script
-- Migrates member data with proper institution mapping. Idempotent: ON CONFLICT DO NOTHING.

DO $$
DECLARE
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    kampala_sacco_branch_id UUID;
    quick_cash_branch_id UUID;
    opportunity_mfi_branch_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM institutions WHERE name = 'Opportunity Microfinance Uganda';
    SELECT id INTO kampala_sacco_branch_id FROM branches WHERE institution_id = kampala_sacco_id ORDER BY created_at LIMIT 1;
    SELECT id INTO quick_cash_branch_id FROM branches WHERE institution_id = quick_cash_id ORDER BY created_at LIMIT 1;
    SELECT id INTO opportunity_mfi_branch_id FROM branches WHERE institution_id = opportunity_mfi_id ORDER BY created_at LIMIT 1;

    -- Insert members for Kampala Central SACCO
    INSERT INTO members (
        id,
        institution_id,
        branch_id,
        member_number,
        full_name,
        date_of_birth,
        gender,
        marital_status,
        member_type,
        phone_number,
        email,
        national_id,
        district,
        village,
        occupation,
        monthly_income,
        next_of_kin_name,
        next_of_kin_relationship,
        next_of_kin_phone,
        kyc_status,
        status,
        join_date
    ) VALUES 
    -- Sarah Nakamya
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
        'SL001',
        'Sarah Nakamya',
        '1985-03-15',
        'Female',
        'Married',
        'Individual',
        '+256701234567',
        'sarah.nakamya@email.com',
        'CM12345678901234',
        'Kampala',
        'Ntinda',
        'Teacher',
        800000,
        'John Nakamya',
        'Spouse',
        '+256701234568',
        'Verified',
        'Active',
        '2023-01-15'
    ),
    -- David Ssemakula
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
        'SL002',
        'David Ssemakula',
        '1978-11-22',
        'Male',
        'Single',
        'Individual',
        '+256702345678',
        NULL,
        'CM23456789012345',
        'Wakiso',
        'Kira',
        'Farmer',
        500000,
        'Mary Ssemakula',
        'Mother',
        '+256702345679',
        'Verified',
        'Active',
        '2023-02-20'
    ),
    -- Grace Namugga
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
        'SL003',
        'Grace Namugga',
        '1990-07-08',
        'Female',
        'Divorced',
        'Individual',
        '+256703456789',
        'grace.namugga@email.com',
        'CM34567890123456',
        'Mukono',
        'Seeta',
        'Small Business Owner',
        1200000,
        'Peter Namugga',
        'Brother',
        '+256703456790',
        'Pending',
        'Active',
        '2023-03-10'
    ),
    -- Robert Kiwanuka
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
        'SL004',
        'Robert Kiwanuka',
        '1965-12-03',
        'Male',
        'Widowed',
        'Individual',
        '+256704567890',
        NULL,
        'CM45678901234567',
        'Kampala',
        'Bugolobi',
        'Civil Servant',
        1500000,
        'Alice Kiwanuka',
        'Daughter',
        '+256704567891',
        'Verified',
        'Active',
        '2023-04-12'
    )
    ON CONFLICT (institution_id, member_number) DO NOTHING;

    -- Insert members for Quick Cash Uganda (Money Lender)
    INSERT INTO members (
        id,
        institution_id,
        branch_id,
        member_number,
        full_name,
        date_of_birth,
        gender,
        marital_status,
        member_type,
        phone_number,
        email,
        national_id,
        district,
        village,
        occupation,
        monthly_income,
        next_of_kin_name,
        next_of_kin_relationship,
        next_of_kin_phone,
        kyc_status,
        status,
        join_date
    ) VALUES 
    -- Moses Kiprotich
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
        'QC001',
        'Moses Kiprotich',
        '1988-05-12',
        'Male',
        'Married',
        'Individual',
        '+256707890123',
        'moses.kiprotich@email.com',
        'CM78901234567890',
        'Kampala',
        'Bwaise',
        'Boda Boda Rider',
        400000,
        'Jane Kiprotich',
        'Spouse',
        '+256707890124',
        'Verified',
        'Active',
        '2023-08-15'
    ),
    -- Betty Nakato
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
        'QC002',
        'Betty Nakato',
        '1995-02-28',
        'Female',
        'Single',
        'Individual',
        '+256708901234',
        'betty.nakato@email.com',
        'CM89012345678901',
        'Wakiso',
        'Nansana',
        'Hair Salon Owner',
        600000,
        'Susan Nakato',
        'Sister',
        '+256708901235',
        'Verified',
        'Active',
        '2023-09-20'
    ),
    -- James Okello
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
        'QC003',
        'James Okello',
        '1982-11-15',
        'Male',
        'Divorced',
        'Individual',
        '+256709012345',
        NULL,
        'CM90123456789012',
        'Kampala',
        'Katwe',
        'Mechanic',
        800000,
        'Mary Okello',
        'Mother',
        '+256709012346',
        'Verified',
        'Active',
        '2023-10-05'
    )
    ON CONFLICT (institution_id, member_number) DO NOTHING;

    -- Insert members for Opportunity Microfinance Uganda (MFI)
    INSERT INTO members (
        id,
        institution_id,
        branch_id,
        member_number,
        full_name,
        date_of_birth,
        gender,
        marital_status,
        member_type,
        phone_number,
        email,
        national_id,
        district,
        village,
        occupation,
        monthly_income,
        next_of_kin_name,
        next_of_kin_relationship,
        next_of_kin_phone,
        kyc_status,
        status,
        join_date
    ) VALUES 
    -- Agnes Namutebi
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        opportunity_mfi_branch_id,
        'OM001',
        'Agnes Namutebi',
        '1987-04-18',
        'Female',
        'Married',
        'Individual',
        '+256710123456',
        'agnes.namutebi@email.com',
        'CM01234567890123',
        'Mukono',
        'Lugazi',
        'Market Vendor',
        350000,
        'Paul Namutebi',
        'Spouse',
        '+256710123457',
        'Verified',
        'Active',
        '2023-07-10'
    ),
    -- Kampala Women's Group
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        opportunity_mfi_branch_id,
        'OM002',
        'Kampala Women''s Group',
        '2020-01-01',
        'Other',
        'Single',
        'Group',
        '+256705678901',
        'info@kampalawomensgroup.org',
        'GR56789012345678',
        'Kampala',
        'Wandegeya',
        'Group Business',
        2500000,
        'Margaret Namusoke',
        'Group Leader',
        '+256705678902',
        'Verified',
        'Active',
        '2023-05-20'
    ),
    -- Patricia Nabirye
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        opportunity_mfi_branch_id,
        'OM003',
        'Patricia Nabirye',
        '1992-09-14',
        'Female',
        'Single',
        'Individual',
        '+256706789012',
        'patricia.nabirye@email.com',
        'CM67890123456789',
        'Jinja',
        'Bugembe',
        'Healthcare Worker',
        900000,
        'Joseph Nabirye',
        'Father',
        '+256706789013',
        'Verified',
        'Inactive',
        '2023-06-08'
    )
    ON CONFLICT (institution_id, member_number) DO NOTHING;

    -- Seed member KYC documents (one row per member in member_kyc_docs)
    INSERT INTO member_kyc_docs (
        institution_id, branch_id, member_id, doc_type,
        passport_photo, document_front, document_back, status, reviewed_at
    )
    SELECT m.institution_id, m.branch_id, m.id, 'national_id',
           v.passport_photo, v.document_front, v.document_back, v.doc_status,
           CASE WHEN v.doc_status = 'verified' THEN NOW() ELSE NULL END
    FROM members m
    JOIN (VALUES
        ('SL001', '/passport-photo-of-sarah-nakamya.png', '/uganda-national-id-front-cm1234567890123.png', '/uganda-national-id-back.png', 'verified'),
        ('SL002', '/passport-photo-of-james-mukasa.png', '/uganda-national-id-front-cm2345678901234.png', '/uganda-national-id-back.png', 'verified'),
        ('SL003', '/passport-photo-of-grace-namugga.png', '/uganda-national-id-front-cm3456789012345.png', '/uganda-national-id-back.png', 'pending_review'),
        ('SL004', '/passport-photo-of-robert-kiwanuka.png', '/uganda-national-id-front-cm4567890123456.png', '/uganda-national-id-back.png', 'verified'),
        ('QC001', '/passport-photo-of-moses-kiprotich.png', '/uganda-national-id-front-cm7890123456789.png', '/uganda-national-id-back.png', 'verified'),
        ('QC002', '/passport-photo-of-betty-nakato.png', '/uganda-national-id-front-cm8901234567890.png', '/uganda-national-id-back.png', 'verified'),
        ('QC003', '/passport-photo-of-james-okello.png', '/uganda-national-id-front-cm9012345678901.png', '/uganda-national-id-back.png', 'verified'),
        ('OM001', '/passport-photo-of-agnes-namutebi.png', '/uganda-national-id-front-cm0123456789012.png', '/uganda-national-id-back.png', 'verified'),
        ('OM002', '/passport-photo-of-kampala-womens-group.png', '/uganda-national-id-front-gr5678901234567.png', '/uganda-national-id-back.png', 'verified'),
        ('OM003', '/passport-photo-of-patricia-nabirye.png', '/uganda-national-id-front-cm6789012345678.png', '/uganda-national-id-back.png', 'verified')
    ) AS v(member_number, passport_photo, document_front, document_back, doc_status) ON m.member_number = v.member_number
    WHERE NOT EXISTS (
        SELECT 1 FROM member_kyc_docs d
        WHERE d.member_id = m.id
    );

END $$;

-- Create member shares for SACCO members (skip if member already has shares) (only Kampala Central SACCO has shares)
DO $$
DECLARE
    member_rec RECORD;
    staff_id UUID;
    tx_id UUID;
    shares_count INT;
    purchase_dt DATE;
    tx_num TEXT;
BEGIN
    -- Get a staff user for Kampala Central SACCO to record transactions
    SELECT u.id INTO staff_id 
    FROM users u
    JOIN institutions i ON u.institution_id = i.id
    WHERE i.name = 'Kampala Central SACCO'
    LIMIT 1;

    -- Insert shares for Kampala Central SACCO members (one record per member; skip if exists)
    FOR member_rec IN 
        SELECT c.id as member_id, c.institution_id, c.branch_id, c.member_number, c.full_name
        FROM members c
        JOIN institutions i ON c.institution_id = i.id
        WHERE i.name = 'Kampala Central SACCO'
    LOOP
        IF NOT EXISTS (SELECT 1 FROM member_shares WHERE member_id = member_rec.member_id) THEN
            shares_count := CASE 
                WHEN member_rec.member_number = 'SL001' THEN 15  -- Sarah Nakamya
                WHEN member_rec.member_number = 'SL002' THEN 10  -- David Ssemakula
                WHEN member_rec.member_number = 'SL003' THEN 20  -- Grace Namugga
                WHEN member_rec.member_number = 'SL004' THEN 25  -- Robert Kiwanuka
                ELSE 5
            END;

            purchase_dt := CASE 
                WHEN member_rec.member_number = 'SL001' THEN '2023-01-15'
                WHEN member_rec.member_number = 'SL002' THEN '2023-02-20'
                WHEN member_rec.member_number = 'SL003' THEN '2023-03-10'
                WHEN member_rec.member_number = 'SL004' THEN '2023-04-12'
                ELSE '2023-01-01'
            END::date;

            tx_id := uuid_generate_v4();
            tx_num := 'TXN-SHARES-' || member_rec.member_number;

            -- Create the share purchase transaction record
            INSERT INTO transactions (
                id,
                institution_id,
                branch_id,
                member_id,
                transaction_number,
                type,
                amount,
                mode,
                transaction_date,
                description,
                balance_after,
                reference_number,
                processed_by,
                status
            ) VALUES (
                tx_id,
                member_rec.institution_id,
                member_rec.branch_id,
                member_rec.member_id,
                tx_num,
                'Deposit',
                shares_count * 50000,
                'Cash',
                purchase_dt,
                'Initial member shares purchase: ' || shares_count || ' shares @ 50,000',
                shares_count * 50000,
                tx_num,
                staff_id,
                'Completed'
            )
            ON CONFLICT (institution_id, transaction_number) DO UPDATE
            SET id = transactions.id
            RETURNING id INTO tx_id;

            -- Insert the member shares record with transaction_id
            INSERT INTO member_shares (
                id,
                transaction_id,
                member_id,
                number_of_shares,
                share_value,
                purchase_date
            ) VALUES (
                uuid_generate_v4(),
                tx_id,
                member_rec.member_id,
                shares_count,
                50000, -- Share value from institution settings
                purchase_dt
            );
        END IF;
    END LOOP;
END $$;

-- Display results for verification
SELECT 
    'Member Migration Completed Successfully' as status,
    COUNT(*) as total_members_created
FROM members;

-- Show members by institution
SELECT 
    i.name as institution_name,
    i.type as institution_type,
    COUNT(c.id) as member_count,
    COUNT(CASE WHEN c.status = 'Active' THEN 1 END) as active_members,
    COUNT(CASE WHEN c.kyc_status = 'Verified' THEN 1 END) as verified_members
FROM institutions i
LEFT JOIN members c ON i.id = c.institution_id
GROUP BY i.id, i.name, i.type
ORDER BY i.name;

-- Show member shares summary
SELECT 
    'Member Shares Created' as status,
    COUNT(*) as total_share_records,
    SUM(number_of_shares) as total_shares,
    SUM(total_value) as total_share_value
FROM member_shares;
