import { invoiceIndexWarning } from '../../../src/indeksregulering/groups';

/** Legger indeksvarselet inn på prosjektene som har ny indeks på avtalen. */
export function withIndexWarnings(projects, data, today) {
  return projects.map((project) => {
    const warning = invoiceIndexWarning({
      projectId: project.projectId,
      projects: data.projects,
      contracts: data.contracts,
      timeEntries: data.timeEntries,
      dueById: data.dueById,
      today,
    });
    if (!warning) return project;
    return {
      ...project,
      indexWarning: warning,
      warnings: [...project.warnings, { level: 'warn', id: 'index', text: 'Ny indeks: regulering bør gjøres først' }],
    };
  });
}

