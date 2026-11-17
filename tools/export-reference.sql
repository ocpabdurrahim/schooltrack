-- =====================================================================
--  SchoolTrack -- export reference data from Oracle (APEX app SMS)
--
--  Run each query on its own in SQL Workshop -> SQL Commands, then use
--  the results grid's DOWNLOAD -> CSV and save it into
--      SchoolTrack\tools\data\<name>.csv
--  with the name given above each query. That folder is in .gitignore:
--  these files contain students' names, their parents' names, mobile
--  numbers and dates of birth, and THIS REPOSITORY IS PUBLIC.
--
--  Column aliases are lower case on purpose -- import.mjs matches the
--  CSV headers exactly.
--
--  This is reference data only: the people and the rate cards. Historical
--  attendance, receipts and results are a later, larger job (and while
--  Oracle still owns those modules, SchoolTrack only mirrors them).
-- =====================================================================


-- ---------------------------------------------------------------------
--  data\settings.csv
-- ---------------------------------------------------------------------
SELECT institute_name  AS "instituteName",
       session_label   AS "sessionLabel",
       school_address  AS "address",
       eiin            AS "eiin",
       head_teacher    AS "headTeacher",
       weekend_days    AS "weekendDays"
  FROM school_settings
 WHERE setting_id = 1;


-- ---------------------------------------------------------------------
--  data\classes.csv
-- ---------------------------------------------------------------------
SELECT TO_CHAR(ci.class_id)               AS "classId",
       ci.class_name                      AS "className",
       ci.section                         AS "section",
       ci.class_name || ' - ' || ci.section AS "displayName",
       ci.class_id                        AS "sortOrder"
  FROM class_info ci
 ORDER BY ci.class_id;


-- ---------------------------------------------------------------------
--  data\students.csv
--  status A = active, I = left. Both are exported: a student who has
--  left still owns their past attendance and receipts.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(s.student_id)              AS "studentId",
       s.full_name                        AS "fullName",
       s.roll_no                          AS "rollNo",
       s.reg_no                           AS "regNo",
       TO_CHAR(s.class_id)                AS "classId",
       ci.class_name                      AS "className",
       ci.section                         AS "section",
       g.group_name                       AS "groupName",
       s.religion                         AS "religion",
       s.gender                           AS "gender",
       TO_CHAR(s.dob, 'YYYY-MM-DD')       AS "dob",
       s.father_name                      AS "fatherName",
       s.mother_name                      AS "motherName",
       s.blood_group                      AS "bloodGroup",
       s.mobile_no                        AS "mobileNo",
       s.status                           AS "status"
  FROM students_info s
  JOIN class_info ci ON ci.class_id = s.class_id
  LEFT JOIN groups g ON g.group_id = s.group_id
 ORDER BY s.class_id, s.roll_no;


-- ---------------------------------------------------------------------
--  data\staff.csv
--  app_username comes across so the importer can propose members/
--  records -- the people who already have APEX logins.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(st.staff_id)               AS "staffId",
       st.full_name                       AS "fullName",
       st.designation                     AS "designation",
       st.mobile_no                       AS "mobileNo",
       st.staff_status                    AS "staffStatus",
       st.app_username                    AS "appUsername",
       TO_CHAR(st.join_date, 'YYYY-MM-DD') AS "joinDate"
  FROM staff st
 ORDER BY st.staff_id;


-- ---------------------------------------------------------------------
--  data\subjects.csv
-- ---------------------------------------------------------------------
SELECT TO_CHAR(su.subject_id)             AS "subjectId",
       su.subject_name                    AS "subjectName",
       su.subject_code                    AS "subjectCode",
       su.total_marks                     AS "fullMarks",
       su.is_optional                     AS "isOptional",
       su.combine_group                   AS "combineGroup"
  FROM subjects_info su
 ORDER BY su.subject_id;


-- ---------------------------------------------------------------------
--  data\components.csv
--
--  How each paper is marked, with each part's OWN pass mark. This is the
--  one that makes 60 in CQ and 8 in MCQ a FAIL at 68 out of 100, so it is
--  worth exporting even for a school that only wants totals today.
--
--  One row per part; the importer gathers a subject's rows onto the
--  subject itself and recomputes its full marks from them.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(c.subject_id)              AS "subjectId",
       c.comp_name                        AS "name",
       c.max_marks                        AS "max",
       c.pass_marks                       AS "pass"
  FROM subject_components c
 ORDER BY c.subject_id, c.max_marks DESC, c.comp_name;


-- ---------------------------------------------------------------------
--  data\exams.csv
-- ---------------------------------------------------------------------
SELECT TO_CHAR(e.exam_id)                 AS "examId",
       e.exam_name                        AS "examName",
       e.exam_year                        AS "examYear",
       UPPER(REPLACE(e.exam_name, ' ', '_')) || '-' || e.exam_year AS "periodLabel"
  FROM exams e
 ORDER BY e.exam_year, e.exam_id;


-- ---------------------------------------------------------------------
--  data\feeHeads.csv
-- ---------------------------------------------------------------------
SELECT TO_CHAR(h.fee_head_id)             AS "feeHeadId",
       h.head_code                        AS "headCode",
       h.head_name                        AS "headName",
       h.frequency                        AS "frequency",
       h.is_active                        AS "isActive"
  FROM fee_head h
 ORDER BY h.fee_head_id;


-- ---------------------------------------------------------------------
--  data\feeStructure.csv
--  Document id is feeHeadId_className_sessionYear, so the Oracle unique
--  constraint survives as a key rather than as a hope.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(fs.fee_head_id)            AS "feeHeadId",
       fs.class_name                      AS "className",
       TO_CHAR(fs.session_year)           AS "sessionYear",
       fs.amount                          AS "amount"
  FROM fee_structure fs
 ORDER BY fs.session_year, fs.class_name;


-- ---------------------------------------------------------------------
--  data\expenseHeads.csv
-- ---------------------------------------------------------------------
SELECT TO_CHAR(eh.expense_head_id)        AS "expenseHeadId",
       eh.head_code                       AS "headCode",
       eh.head_name                       AS "headName",
       eh.is_active                       AS "isActive",
       eh.sort_ord                        AS "sortOrder"
  FROM expense_head eh
 ORDER BY eh.sort_ord, eh.head_name;


-- ---------------------------------------------------------------------
--  data\holidays.csv
--  Every loaded holiday, not just 2026 -- the attendance screens need
--  past years to calculate anything historical.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(h.holiday_date, 'YYYY-MM-DD') AS "date",
       h.holiday_name                        AS "name"
  FROM attendance_holiday h
 ORDER BY h.holiday_date;
