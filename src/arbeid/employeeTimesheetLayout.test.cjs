/**
 * Timer under Ansatte skal ikke sitte i en 1400px-kolonne.
 * Samme ArbeidScreen som timelisten, i full bredde.
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../..');
const screen = fs.readFileSync(path.join(root, 'screens/employees/EmployeesScreen.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app.web.css'), 'utf8');
const tabs = fs.readFileSync(path.join(root, 'src/employees/personTabs.js'), 'utf8');

assert.match(tabs, /PERSON_FILL_VIEWS = new Set\(\[[\s\S]*'hours'/);
assert.match(screen, /nativeID="employee-hours-view"/);
assert.match(screen, /<ArbeidScreen\s+lockedEmployeeId=\{selected\.id\}\s+embedded\b/);
assert.doesNotMatch(screen, /maxWidth:\s*1400/);
assert.match(screen, /hoursHost: \{[^}]*width: '100%'[^}]*alignSelf: 'stretch'/);
assert.match(css, /#employee-hours-view #timesheet-grid/);
assert.match(css, /max-width:\s*none !important/);

console.log('employeeTimesheetLayout.test.cjs: ok');
