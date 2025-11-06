# Test User Credentials

## Company Information
- **Company Name**: TestCompany
- **Company ID**: `comp_1761932797079_xoepoo6ed`
- **Industry**: Construction

## Admin User Credentials
- **Email**: test@test.com
- **Password**: TestPass123
- **Role**: admin
- **User ID**: 4448a418-3081-7077-ca53-4adf56d6fc12

## Test Employee User Credentials
- **Email**: testuser@example.com
- **Password**: TestUser123!
- **Username**: testuser@example.com
- **Role**: user
- **User ID**: 24784468-b061-7095-99fc-c940cc1d7578

## Cognito Configuration
- **User Pool ID**: us-east-1_GvpeCqtAc
- **Client ID**: 1konm59fgcjf1tf4rhk16bobi1

## API Endpoints
- **Base URL**: https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod

### Available Endpoints:
- `POST /registerCompany` - Register new company
- `POST /sendInvitation` - Send employee invitation (admin only)
- `POST /acceptInvitation` - Accept invitation
- `GET/POST/PUT/DELETE /projects` - Manage company projects
- `GET/POST/PUT/DELETE /expenses` - Manage company expenses
- `GET/POST/PUT/DELETE /contractors` - Manage company contractors
- `GET/POST/PUT/DELETE /works` - Manage company works

## Notes
- Both users belong to the same company (TestCompany)
- All data operations are company-scoped
- Authentication required for all business endpoints
- Admin can invite new users, regular users cannot