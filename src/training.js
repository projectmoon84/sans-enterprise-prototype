// Mock SANS training data: the course catalogue, GIAC certifications and the
// seeded training histories. In production this comes from SANS systems.
// Pure functions only, so the store, the profile page and the tests can share it.

export const ENROLMENT_STATUSES = [
  "requested",
  "approved",
  "in_progress",
  "completed",
  "withdrawn",
];
// A course someone is still on, or waiting to start.
export const CURRENT_STATUSES = ["requested", "approved", "in_progress"];
export const CERT_WARNING_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;
const CERT_VALIDITY_DAYS = 4 * 365;

export const COURSES = [
  { id: "course-sec275", code: "SEC275", title: "Foundations: Computers, Technology and Security", cert: ["GFACT", "GIAC Foundational Cybersecurity Technologies"] },
  { id: "course-sec401", code: "SEC401", title: "Security Essentials: Network, Endpoint and Cloud", cert: ["GSEC", "GIAC Security Essentials"] },
  { id: "course-sec504", code: "SEC504", title: "Hacker Tools, Techniques and Incident Handling", cert: ["GCIH", "GIAC Certified Incident Handler"] },
  { id: "course-sec510", code: "SEC510", title: "Multicloud Security Assessment and Defence", cert: ["GMCS", "GIAC Multicloud Security"] },
  { id: "course-sec540", code: "SEC540", title: "Cloud Security and DevSecOps Automation", cert: ["GCSA", "GIAC Cloud Security Automation"] },
  { id: "course-sec560", code: "SEC560", title: "Enterprise Penetration Testing", cert: ["GPEN", "GIAC Penetration Tester"] },
  { id: "course-for508", code: "FOR508", title: "Advanced Incident Response and Threat Hunting", cert: ["GCFA", "GIAC Certified Forensic Analyst"] },
  { id: "course-ldr512", code: "LDR512", title: "Security Leadership Essentials for Managers", cert: ["GSLC", "GIAC Security Leadership"] },
  { id: "course-ics410", code: "ICS410", title: "ICS/SCADA Security Essentials", cert: ["GICSP", "Global Industrial Cyber Security Professional"] },
].map(({ cert, ...course }) => ({
  ...course,
  certCode: cert[0],
  certName: cert[1],
}));

export const courseLabel = (course) => `${course.code}: ${course.title}`;

// Valid, expiring within the warning window, or expired.
export function certificationStatus(cert, now = new Date()) {
  const days = Math.ceil((Date.parse(cert.expiresAt) - now.getTime()) / DAY);
  if (days < 0) return { key: "expired", label: "Expired", days };
  if (days <= CERT_WARNING_DAYS)
    return { key: "expiring", label: "Expiring soon", days };
  return { key: "valid", label: "Valid", days };
}

export function currentEnrolments(data, personId) {
  return data.courseEnrolments.filter(
    (item) =>
      item.personId === personId && CURRENT_STATUSES.includes(item.status),
  );
}

// Each template is one student's history, as day offsets from the seed date.
const TEMPLATES = [
  { done: [["SEC401", -520, -440, 88]], now: [["SEC504", "in_progress", -50, 45]] },
  { done: [["SEC275", -300, -250, 92]], now: [["SEC401", "in_progress", -20, 20]], withdrawn: [["SEC540", -120]] },
  { done: [["SEC401", -1500, -1432, 81], ["SEC504", -200, -150, 94]], now: [] },
  { done: [], now: [["SEC560", "requested", -2, 0]] },
  { done: [["SEC504", -1700, -1650, 79]], now: [["FOR508", "in_progress", -150, 70]] },
  { done: [["SEC275", -90, -60, 85]], now: [["LDR512", "approved", -1, 0]] },
  { done: [], now: [] },
];

// Returns the seeded enrolments and certifications, plus the events to log for them.
export function buildTrainingSeed(data, base) {
  const stamp = (offsetDays) => new Date(base + offsetDays * DAY).toISOString();
  const byCode = (code) => COURSES.find((course) => course.code === code);
  const admin = data.people.find(
    (person) => person.portal && person.portal.role === "Admin",
  );
  const courseEnrolments = [];
  const certifications = [];
  const events = [];
  const students = data.people.filter((person) => person.student);
  students.forEach((person, index) => {
    const template = TEMPLATES[index % TEMPLATES.length];
    const voucherId = person.student.voucherId;
    const target = (course) => ({ type: "course", id: course.id, name: courseLabel(course) });
    for (const [code, start, end, score] of template.done) {
      const course = byCode(code);
      courseEnrolments.push({
        id: `enrol-${person.id}-${code}`,
        personId: person.id,
        courseId: course.id,
        status: "completed",
        voucherId,
        startedAt: stamp(start),
        endsAt: stamp(end),
        completedAt: stamp(end),
        progress: 100,
        score,
      });
      events.push({ action: "training.completed", actorId: "sans", subjectId: person.id, target: target(course), at: stamp(end) });
      certifications.push({
        id: `cert-${person.id}-${course.certCode}`,
        personId: person.id,
        courseId: course.id,
        code: course.certCode,
        name: course.certName,
        issuedAt: stamp(end + 2),
        expiresAt: stamp(end + 2 + CERT_VALIDITY_DAYS),
      });
      events.push({ action: "certification.earned", actorId: "sans", subjectId: person.id, target: { type: "certification", id: `cert-${person.id}-${course.certCode}`, name: course.certCode }, at: stamp(end + 2) });
    }
    for (const [code, status, start, progress] of template.now) {
      const course = byCode(code);
      const started = status === "in_progress";
      courseEnrolments.push({
        id: `enrol-${person.id}-${code}`,
        personId: person.id,
        courseId: course.id,
        status,
        voucherId,
        requestedAt: stamp(start),
        ...(started ? { startedAt: stamp(start), endsAt: stamp(start + 120) } : {}),
        progress,
      });
      if (status === "requested")
        events.push({ action: "training.requested", actorId: person.id, subjectId: person.id, target: target(course), at: stamp(start) });
      else
        events.push({ action: "training.assigned", actorId: admin?.id || "system", subjectId: person.id, target: target(course), at: stamp(start) });
    }
    for (const [code, start] of template.withdrawn || []) {
      const course = byCode(code);
      courseEnrolments.push({
        id: `enrol-${person.id}-${code}`,
        personId: person.id,
        courseId: course.id,
        status: "withdrawn",
        voucherId,
        startedAt: stamp(start),
        withdrawnAt: stamp(start + 14),
        progress: 5,
      });
      events.push({ action: "training.assigned", actorId: admin?.id || "system", subjectId: person.id, target: target(course), at: stamp(start) });
      events.push({ action: "training.withdrawn", actorId: admin?.id || "system", subjectId: person.id, target: target(course), at: stamp(start + 14) });
    }
  });
  return { courseEnrolments, certifications, events };
}
