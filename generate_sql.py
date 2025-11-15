#!/usr/bin/env python3
import json

with open('production-data.json', 'r', encoding='utf-8') as f:
    properties = json.load(f)

sql_statements = []

for prop in properties:
    # Escape single quotes in strings
    def escape_sql(value):
        if value is None:
            return 'NULL'
        if isinstance(value, str):
            return "'" + value.replace("'", "''") + "'"
        if isinstance(value, (list, dict)):
            return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'"
        return str(value)
    
    sql = f"""INSERT INTO properties (
        id, type, title, location, status, deadline, price, households, tags, badge, 
        description, image_url, created_at, updated_at, area_type, supply_area, 
        exclusive_area, floor_info, parking, heating, entrance_type, builder, constructor, 
        move_in_date, subscription_start, subscription_end, special_supply_date, 
        general_supply_date, winner_announcement, contract_date, sale_price_min, 
        sale_price_max, region, city, district, household_count, transportation, 
        nearby_facilities, homepage_url, contact_number, full_address, lat, lng, 
        original_price, recent_trade_price, expected_margin, margin_rate, lh_notice_url, 
        pdf_url, infrastructure, education, shopping, medical, park, developer_company, 
        registration_method, eligibility, priority_info, price_label, extended_data, 
        publication_status
    ) VALUES (
        {prop['id']}, {escape_sql(prop['type'])}, {escape_sql(prop['title'])}, 
        {escape_sql(prop['location'])}, {escape_sql(prop['status'])}, 
        {escape_sql(prop['deadline'])}, {escape_sql(prop['price'])}, 
        {escape_sql(prop['households'])}, {escape_sql(prop['tags'])}, 
        {escape_sql(prop['badge'])}, {escape_sql(prop['description'])}, 
        {escape_sql(prop['image_url'])}, {escape_sql(prop['created_at'])}, 
        {escape_sql(prop['updated_at'])}, {escape_sql(prop['area_type'])}, 
        {escape_sql(prop['supply_area'])}, {escape_sql(prop['exclusive_area'])}, 
        {escape_sql(prop['floor_info'])}, {escape_sql(prop['parking'])}, 
        {escape_sql(prop['heating'])}, {escape_sql(prop['entrance_type'])}, 
        {escape_sql(prop['builder'])}, {escape_sql(prop['constructor'])}, 
        {escape_sql(prop['move_in_date'])}, {escape_sql(prop['subscription_start'])}, 
        {escape_sql(prop['subscription_end'])}, {escape_sql(prop['special_supply_date'])}, 
        {escape_sql(prop['general_supply_date'])}, {escape_sql(prop['winner_announcement'])}, 
        {escape_sql(prop['contract_date'])}, {prop['sale_price_min']}, 
        {prop['sale_price_max']}, {escape_sql(prop['region'])}, {escape_sql(prop['city'])}, 
        {escape_sql(prop['district'])}, {prop['household_count']}, 
        {escape_sql(prop['transportation'])}, {escape_sql(prop['nearby_facilities'])}, 
        {escape_sql(prop['homepage_url'])}, {escape_sql(prop['contact_number'])}, 
        {escape_sql(prop['full_address'])}, {prop['lat']}, {prop['lng']}, 
        {prop['original_price']}, {prop['recent_trade_price']}, 
        {prop['expected_margin']}, {prop['margin_rate']}, 
        {escape_sql(prop['lh_notice_url'])}, {escape_sql(prop['pdf_url'])}, 
        {escape_sql(prop['infrastructure'])}, {escape_sql(prop['education'])}, 
        {escape_sql(prop['shopping'])}, {escape_sql(prop['medical'])}, 
        {escape_sql(prop['park'])}, {escape_sql(prop['developer_company'])}, 
        {escape_sql(prop['registration_method'])}, {escape_sql(prop['eligibility'])}, 
        {escape_sql(prop['priority_info'])}, {escape_sql(prop['price_label'])}, 
        {escape_sql(prop['extended_data'])}, {escape_sql(prop['publication_status'])}
    );"""
    
    sql_statements.append(sql)

with open('seed-production.sql', 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(sql_statements))

print(f"Generated {len(sql_statements)} INSERT statements in seed-production.sql")
