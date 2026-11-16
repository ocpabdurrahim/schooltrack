/**
 * Certificates and the register of what has been issued.
 *
 * Every certificate the school hands out is recorded here before it is
 * printed, with a serial number from a counter — the same discipline as
 * receipts, and for the same reason: a testimonial is a document the school
 * will be asked to confirm years later, and "we printed one for her in 2026"
 * is not an answer unless it is written down.
 *
 * Nothing here is ever edited or deleted. A certificate issued wrongly is
 * cancelled by issuing another one, and the register keeps both.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import type { StudentDetail } from './people';

const school = () => doc(db, 'schools', SCHOOL_ID);

export type DocumentType = 'TESTIMONIAL' | 'TRANSFER' | 'CHARACTER';

export const DOCUMENT_TYPES: { type: DocumentType; label: string; prefix: string }[] = [
  { type: 'TESTIMONIAL', label: 'Testimonial', prefix: 'TST' },
  { type: 'TRANSFER', label: 'Transfer certificate', prefix: 'TC' },
  { type: 'CHARACTER', label: 'Character certificate', prefix: 'CHR' },
];

export const typeLabel = (t: DocumentType) =>
  DOCUMENT_TYPES.find((d) => d.type === t)?.label ?? t;

export type IssuedDocument = {
  serialNo: string;
  type: DocumentType;
  studentId: string;
  studentName: string;
  classLabel: string;
  rollNo: number;
  regNo?: string;
  fatherName?: string;
  motherName?: string;
  dob?: string;
  issueDate: string;
  issuedBy: string;
  /** TRANSFER only */
  dateOfLeaving?: string;
  reason?: string;
  /** TESTIMONIAL and CHARACTER */
  conduct?: string;
  remarks?: string;
};

export const CONDUCTS = ['Excellent', 'Very good', 'Good', 'Satisfactory'];

/**
 * Issues one certificate: the serial number and the record are written in a
 * single transaction, so a serial can never be handed out without a document
 * behind it. The document id IS the serial, which makes a retry overwrite
 * rather than issue a second certificate.
 */
export async function issueDocument(input: {
  type: DocumentType;
  student: StudentDetail;
  issueDate: string;
  issuedBy: string;
  dateOfLeaving?: string;
  reason?: string;
  conduct?: string;
  remarks?: string;
}): Promise<string> {
  const prefix = DOCUMENT_TYPES.find((d) => d.type === input.type)?.prefix ?? 'DOC';
  const counterRef = doc(school(), 'counters', 'documents');

  return runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef);
    const next = counter.exists() ? (counter.data().next as number) : 1;
    const serialNo = `${prefix}-${String(next).padStart(6, '0')}`;

    const record: IssuedDocument = {
      serialNo,
      type: input.type,
      studentId: input.student.studentId,
      studentName: input.student.fullName,
      classLabel: `${input.student.className} - ${input.student.section}`,
      rollNo: input.student.rollNo,
      regNo: input.student.regNo,
      fatherName: input.student.fatherName,
      motherName: input.student.motherName,
      dob: input.student.dob,
      issueDate: input.issueDate,
      issuedBy: input.issuedBy,
      dateOfLeaving: input.dateOfLeaving,
      reason: input.reason,
      conduct: input.conduct,
      remarks: input.remarks,
    };

    // the student's details are SNAPSHOTTED onto the certificate: a transfer
    // certificate must keep saying Class 8 even after the roll is promoted
    tx.set(doc(school(), 'documents', serialNo), {
      ...Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v !== '')),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(counterRef, { next: next + 1 }, { merge: true });

    return serialNo;
  });
}

export async function getDocument(serialNo: string): Promise<IssuedDocument | null> {
  const snap = await getDoc(doc(school(), 'documents', serialNo));
  return snap.exists() ? (snap.data() as IssuedDocument) : null;
}

export async function listDocuments(max = 50): Promise<IssuedDocument[]> {
  const snap = await getDocs(query(
    collection(school(), 'documents'),
    orderBy('issueDate', 'desc'),
    limit(max),
  ));
  return snap.docs.map((d) => d.data() as IssuedDocument);
}

export async function documentsFor(studentId: string): Promise<IssuedDocument[]> {
  const snap = await getDocs(query(
    collection(school(), 'documents'),
    where('studentId', '==', studentId),
  ));
  return snap.docs
    .map((d) => d.data() as IssuedDocument)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

/** What the ID card's QR carries — the same text the gate scanner parses. */
export const cardCode = (studentId: string) => `SMS-STU-${studentId}`;
