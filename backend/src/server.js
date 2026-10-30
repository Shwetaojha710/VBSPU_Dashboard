const app = require('./app');
const config = require('./config');
const { getSummary } = require('./services/dashboard.service');
const { getDetail, DETAIL_KEYS } = require('./services/dashboard-details.service');
const { getExamStatus } = require('./services/exam-status.service');
const { getEnrollmentByType } = require('./services/enrollment-by-type.service');
const { getCourseStatus } = require('./services/course-status.service');

/** The summary and card details scan large tables; load them once at startup, one at a time. */
const warmUp = async () => {
  const loads = [
    getSummary,
    getEnrollmentByType,
    getExamStatus,
    getCourseStatus,
    ...DETAIL_KEYS.map((key) => () => getDetail(key)),
  ];
  for (const load of loads) {
    await load().catch((err) => console.error('Dashboard warm-up failed:', err.message));
  }
};

app.listen(config.port, () => {
  console.log(`VBSPU Dashboard API running on http://localhost:${config.port} (${config.env})`);
  warmUp();
});
