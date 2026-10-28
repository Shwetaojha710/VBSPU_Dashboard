const { getPool } = require('../config/db');
const config = require('../config');

/*
 * Dashboard figures from the *_vbspu tables only. All queries are aggregates;
 * personal columns (contact, bank, ID numbers, passwords) are never selected.
 */
const SUMMARY_QUERY = `
SELECT
  (SELECT COUNT(DISTINCT RegistrationNo) FROM dbo.Student_Data_vbspu) AS totalStudents,
  (SELECT COUNT(*) FROM dbo.M_College_vbspu) AS affiliatedColleges,
  (SELECT COUNT(DISTINCT District) FROM dbo.M_College_vbspu WHERE NULLIF(LTRIM(District), '') IS NOT NULL) AS collegeDistricts,
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final_vbspu WHERE ISNULL(delflg, 0) = 0) AS evaluators,
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final_vbspu
     WHERE ISNULL(delflg, 0) = 0 AND ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0) AS pendingEvaluatorApprovals;

SELECT UPPER(LTRIM(RTRIM(District))) AS district, COUNT(*) AS colleges
FROM dbo.M_College_vbspu
WHERE NULLIF(LTRIM(District), '') IS NOT NULL
GROUP BY UPPER(LTRIM(RTRIM(District)))
ORDER BY colleges DESC;
`;

let cache = { at: 0, value: null };

const toTitle = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const fetchSummary = async () => {
  const pool = await getPool();
  const { recordsets } = await pool.request().query(SUMMARY_QUERY);
  const [totals] = recordsets[0];
  return {
    source: 'database',
    generatedAt: new Date().toISOString(),
    stats: {
      totalStudents: totals.totalStudents,
      affiliatedColleges: totals.affiliatedColleges,
      collegeDistricts: totals.collegeDistricts,
      facultyAndStaff: totals.evaluators,
      pendingApprovals: totals.pendingEvaluatorApprovals,
    },
    collegesByDistrict: recordsets[1].map((r) => ({ name: toTitle(r.district), colleges: r.colleges })),
  };
};

/** Cached summary, so the large student table is not scanned on every page load. */
const getSummary = async () => {
  if (cache.value && Date.now() - cache.at < config.dashboardCacheMs) {
    return cache.value;
  }
  const value = await fetchSummary();
  cache = { at: Date.now(), value };
  return value;
};

module.exports = { getSummary };
