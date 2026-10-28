/**
 * Utlegg i Økonomi → Utlegg: ansatt, prosjekt og kunde velges fra registrene, så utlegget
 * er koblet med id (DRIFT-24). Før var kunde og prosjekt fritekst, og utlegget kom ikke
 * med på prosjektet eller i Til fakturering for riktig kunde.
 */

function text(value) {
  return String(value || '').trim();
}

const NO_PROJECT = { projectId: '', projectNumber: '', projectName: '' };
const NO_CUSTOMER = { customerId: '', customerNumber: '', customerName: '' };

/**
 * Feltene som settes når et valg gjøres i skjemaet.
 * kind: 'employee' | 'project' | 'customer'. id: '' fjerner valget.
 * Prosjektet tar med seg kunden sin. En annen kunde fjerner et prosjekt som hører til en annen.
 */
export function expenseRegistryPatch(kind, id, { people = [], projects = [], customers = [], current = {} } = {}) {
  const key = text(id);
  if (kind === 'employee') {
    const person = people.find((row) => text(row.id) === key);
    return { employeeId: key, employeeName: person ? text(person.label || person.name) : '' };
  }
  if (kind === 'project') {
    if (!key) return { ...NO_PROJECT };
    const project = projects.find((row) => text(row.id) === key);
    if (!project) return { ...NO_PROJECT };
    const customer = customers.find((row) => text(row.id) && text(row.id) === text(project.customerId));
    return {
      projectId: key,
      projectNumber: text(project.number),
      projectName: text(project.name),
      ...(project.customerId || project.client
        ? {
          customerId: text(project.customerId),
          customerNumber: text(customer?.customerNumber) || text(project.customerNumber),
          customerName: text(customer?.name) || text(project.client),
        }
        : {}),
    };
  }
  if (kind === 'customer') {
    if (!key) return { ...NO_CUSTOMER };
    const customer = customers.find((row) => text(row.id) === key);
    if (!customer) return { ...NO_CUSTOMER };
    const project = projects.find((row) => text(row.id) === text(current.projectId));
    const otherCustomer = project && text(project.customerId) && text(project.customerId) !== key;
    return {
      customerId: key,
      customerNumber: text(customer.customerNumber),
      customerName: text(customer.name),
      ...(otherCustomer ? NO_PROJECT : {}),
    };
  }
  return {};
}
