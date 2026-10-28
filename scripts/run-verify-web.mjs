/**
 * Kjører verify:web-filene én og én med tidsgrense.
 * En gammel test som venter på nett skal ikke holde GitHub-jobben i timevis.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const TIMEOUT_MS = 60_000;

export const FILES = [
  'scripts/ensure-functions-modules.mjs',
  'scripts/resolve-build-id.test.mjs',
  'scripts/hosting-stamp.test.mjs',
  'scripts/stage-function-src.test.mjs',
  'scripts/open-callable-invoker.test.mjs',
  'functions/importPages.test.mjs',
  'functions/uploadStorage.test.mjs',
  'functions/mailApiKey.test.mjs',
  'functions/inviteBrand.test.mjs',
  'scripts/old-brand.test.mjs',
  'src/utils/legacyNames.test.mjs',
  // Personvern: vilkår, samtykker, databehandleravtale, eksport og sletting.
  'src/i18n/legal.test.mjs',
  'src/utils/consentState.test.mjs',
  'functions/consentLog.test.mjs',
  'src/privacy/companyPrivacy.test.mjs',
  'functions/anbudIntake.smoke.test.mjs',
  'functions/anbud/intakeScan.test.mjs',
  'src/anbud/intake.test.mjs',
  'src/anbud/bidSymbolButton.test.cjs',
  'src/anbud/documentFile.test.mjs',
  'src/anbud/kgvSource.test.mjs',
  'src/anbud/tenderProxyUrl.test.mjs',
  'src/anbud/competitionUrl.test.mjs',
  'src/anbud/openDocument.test.mjs',
  'src/anbud/hitStore.test.mjs',
  'functions/interpretAvtale.smoke.test.mjs',
  'functions/anbudForm.smoke.test.mjs',
  'functions/slimDeploy.test.mjs',
  'functions/powerOffice.test.mjs',
  'scripts/functions-deploy-needed.test.mjs',
  'scripts/run-verify-web.test.mjs',
  'src/imports/filePayload.test.mjs',
  'src/employees/projectSheet.test.mjs',
  'src/employees/cvFormat.test.mjs',
  'src/employees/cvDocument.test.mjs',
  'src/employees/cvPdfImages.test.mjs',
  'src/employees/cvPdfExport.e2e.test.mjs',
  'src/utils/webBuildRefresh.test.mjs',
  'src/utils/googleLocalAuth.test.mjs',
  'src/ui/saveToast.test.mjs',
  'src/economy/productSalesView.test.mjs',
  'src/economy/productSaleEdit.test.mjs',
  'src/economy/productSalesImport.test.mjs',
  'src/economy/productSalesStorage.test.mjs',
  'src/economy/productCatalog.test.mjs',
  'src/project/catalogDoc.test.mjs',
  'src/project/projectFields.test.mjs',
  'src/project/storage.test.mjs',
  'screens/economy/productDetailRender.test.cjs',
  'components/sales/productSaleSheetRender.test.cjs',
  'src/ui/reportTable.test.mjs',
  'components/table/reportTableRender.test.cjs',
  'src/economy/invoiceReport.test.mjs',
  'src/economy/invoiceEngine.test.mjs',
  'src/economy/invoiceAccounts.test.mjs',
  'src/economy/invoiceDocs.test.mjs',
  'functions/invoiceDelivery.test.mjs',
  'src/anbud/customerReport.test.mjs',
  'src/anbud/customers.test.mjs',
  'src/economy/powerOfficeView.test.mjs',
  'src/arbeid/productSalesList.test.mjs',
  'src/arbeid/absenceDashboard.test.mjs',
  'src/arbeid/absenceImport.test.mjs',
  'src/arbeid/absenceReport.test.mjs',
  'src/arbeid/absenceWidgetNav.test.mjs',
  'src/arbeid/absenceDesktopUi.test.mjs',
  'src/arbeid/absenceDesktopRender.test.cjs',
  'src/arbeid/approvalsQueueRender.test.cjs',
  'src/arbeid/timesheetProjects.test.mjs',
  'src/equipment/model.test.mjs',
  'src/equipment/calendars.test.mjs',
  'src/mileage/routePlan.test.mjs',
  'src/mileage/routeSuggest.test.mjs',
  'src/arbeid/timesheetScreenFilter.test.cjs',
  'src/arbeid/employeeTimesheetLayout.test.cjs',
  'src/shell/shellErrorBoundary.test.mjs',
  'src/shell/shellHeaderSwitchLock.test.cjs',
  'src/shell/standaloneViewport.test.mjs',
  'src/shell/pwaNavigation.test.mjs',
  'src/hr/model.test.mjs',
  'src/hr/followUpTask.test.mjs',
  'src/hr/directory.test.mjs',
  'src/hr/directoryRender.test.mjs',
  'src/hr/dashboard.test.mjs',
  'src/hr/productivity.test.mjs',
  'src/hr/billable.test.mjs',
  'src/capacity/plan.test.mjs',
  'src/capacity/productivityBoard.test.mjs',
  'src/project/timeline.test.mjs',
  'src/project/timelineBoard.test.mjs',
  'src/hr/compliance.test.mjs',
  'src/hr/contractOcr.test.mjs',
  'src/hr/forms.test.mjs',
  'src/forms/forms.test.mjs',
  'src/hr/handbook.test.mjs',
  'src/doccontrol/doccontrol.test.mjs',
  'src/hr/kinReminder.test.mjs',
  'screens/anbud/formFillRender.test.cjs',
  'src/anbud/formBuilder.test.mjs',
  'src/hr/reviewPdf.test.mjs',
  'src/hr/storage.test.mjs',
  'src/hr/integration.test.mjs',
  'src/employees/employmentFlags.test.mjs',
  'src/employees/invite.test.mjs',
  'src/notifications/prefs.test.mjs',
  'src/notifications/audience.test.mjs',
  'src/access/companyAccess.test.mjs',
  'src/modules/moduleHero.test.mjs',
  'src/help/protopPages.test.mjs',
  'src/help/protopProcesses.test.mjs',
  'src/help/assistantEngine.test.mjs',
  'src/help/findTarget.test.mjs',
  'src/help/helpChrome.test.mjs',
  'src/help/helpAccess.test.mjs',
  'src/help/assistantTasks.test.mjs',
  'src/utils/moduleIntros.test.mjs',
  'src/utils/helpCatalog.test.mjs',
  'src/utils/helpLayout.test.mjs',
  'src/utils/helpWelcome.test.mjs',
  'src/modules/moduleActivationIllustrations.test.mjs',
  // Sto utenfor CI og ble liggende røde etter bevisste endringer i appen.
  'src/utils/firestoreRules.list.test.mjs',
  'src/navigation/shellHeaderTitle.test.mjs',
  'screens/economy/indexDeskRender.test.cjs',
  'src/project/projectCrossView.test.mjs',
  'src/arbeid/timesheetReview.test.mjs',
  'src/economy/projectExpensesScreen.test.cjs',
  'scripts/firestoreIndexes.test.mjs',
  'scripts/verify-app-updates.mjs',
  // Rettighetene på ansatte, prosjekt og timer. Sto utenfor CI, så Lese fikk for mye uten at noe ble rødt.
  'src/access/accessCeiling.test.mjs',
  'src/access/viewAsStore.test.mjs',
  'src/employees/employeeReadAccess.test.mjs',
  'src/employees/employeeAbsenceRender.test.cjs',
  'src/employees/personTabs.test.mjs',
  'src/employees/employeeAccount.test.mjs',
  'src/project/projectAccess.test.mjs',
  'src/arbeid/employeeScheduleRender.test.cjs',
  // Prosjekt, kjøretøy, (i)-forklaringene og fagansvar, og at selskapet lagres felt for felt.
  'src/access/accessRules.test.mjs',
  'src/access/accessHeadcount.test.mjs',
  'src/utils/companyChat.test.mjs',
  'src/project/myProjects.test.mjs',
  'src/project/companyFields.test.mjs',
];

function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, file)], { cwd: root, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const file of FILES) {
    const started = Date.now();
    const { code, signal } = await runFile(file);
    if (signal === 'SIGKILL' || code === null) {
      console.error(`verify:web timeout after ${TIMEOUT_MS}ms: ${file}`);
      process.exit(1);
    }
    if (code !== 0) {
      console.error(`verify:web failed (${code}) after ${Date.now() - started}ms: ${file}`);
      process.exit(code || 1);
    }
  }
  console.log(`verify:web ok (${FILES.length} files)`);
}
