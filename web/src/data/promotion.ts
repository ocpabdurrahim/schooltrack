/**
 * Moving a class up at the end of the year.
 *
 * When the final exam of a class is published, the merit list decides the
 * roll numbers of the SAME children in the next class: first in merit becomes
 * roll 1, second becomes roll 2, and so on. Class Ten has no next class --
 * its Test is the last exam the school sets -- so those students are archived
 * instead.
 *
 * NOTHING HERE WRITES ANYTHING. It works out a plan: who goes up, to what
 * roll, who stays, who is archived. The screen shows that plan and a person
 * presses the button. Promotion rewrites every child's class and roll number,
 * and that is not a thing to do as a side effect of pressing Publish.
 *
 * What makes it safe to do at all: a result row stores the classId and rollNo
 * the student had WHEN THE MARKS WERE ENTERED. Last year's tabulation is not
 * looked up through the student's current class, so moving them cannot
 * rewrite their history.
 *
 * This file has a twin: android/.../data/Promotion.kt.
 */

/** A student as the promotion screen needs them, with their final result. */
export type Candidate = {
  studentId: string;
  fullName: string;
  rollNo: number;
  /** null when a compulsory subject has no mark yet: they cannot be ranked. */
  gpa: number | null;
  /** Marks obtained across the counted subjects, the tie-break below GPA. */
  total: number | null;
  /** Compulsory subjects failed. Non-empty means the exam was failed. */
  failed: string[];
  /** A mark is still missing somewhere. */
  incomplete: boolean;
};

export type Standing = 'PASSED' | 'FAILED' | 'INCOMPLETE';

/**
 * How a candidate stands, in one word.
 *
 * Incomplete is kept apart from failed on purpose. "Nobody has entered the
 * Chemistry mark yet" and "this child failed Chemistry" look the same on a
 * sheet with a blank in it, and they are not the same at all: one is a
 * missing piece of work by the school, the other a result for the child.
 */
export function standing(c: Candidate): Standing {
  if (c.incomplete || c.gpa === null) return 'INCOMPLETE';
  return c.failed.length ? 'FAILED' : 'PASSED';
}

/**
 * The merit order: best first.
 *
 * GPA decides it, the total marks break a tie, and the roll number breaks
 * that. The last one is not arbitrary -- without it two children with
 * identical results would swap places every time the list was built, and the
 * roll numbers handed out would change between looking and pressing.
 */
export function meritOrder(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    const sa = standing(a);
    const sb = standing(b);
    // Only a passed result has a place in the merit list; the rest sort to
    // the bottom in a fixed order so the screen is stable.
    if (sa !== sb) {
      const rank = { PASSED: 0, FAILED: 1, INCOMPLETE: 2 };
      return rank[sa] - rank[sb];
    }
    if ((b.gpa ?? -1) !== (a.gpa ?? -1)) return (b.gpa ?? -1) - (a.gpa ?? -1);
    if ((b.total ?? -1) !== (a.total ?? -1)) return (b.total ?? -1) - (a.total ?? -1);
    return a.rollNo - b.rollNo;
  });
}

/** What happens to one student when the class moves up. */
export type Move = {
  studentId: string;
  fullName: string;
  fromRoll: number;
  standing: Standing;
  /** Where they are going: the next class, or null when they are archived. */
  toClassId: string | null;
  /** Their new roll, or null when they stay put or are archived. */
  toRoll: number | null;
  /** 'UP' | 'STAYS' | 'ARCHIVED' */
  what: 'UP' | 'STAYS' | 'ARCHIVED';
};

export type Plan = {
  moves: Move[];
  /** Said plainly when the plan cannot be carried out at all. */
  problem: string;
  /** Worth seeing before pressing the button, but not a reason to stop. */
  warnings: string[];
};

export type PlanInput = {
  /** The class being moved up. */
  fromClassId: string;
  /**
   * Where they are going. Null means there is nowhere above this class, so
   * the students leave the school and are archived -- Class Ten, after its
   * Test.
   */
  toClassId: string | null;
  candidates: Candidate[];
  /**
   * Students already sitting in the next class. Promoting into a class that
   * is not empty would hand out roll numbers somebody else already has.
   */
  alreadyThere?: { rollNo: number; fullName: string }[];
  /**
   * Students the person has ticked to take up anyway, by studentId. A failed
   * or incomplete result stays down unless it is ticked.
   */
  takeAnyway?: string[];
};

/**
 * Who goes where, and with what roll number.
 *
 * Only the students who are actually going up are numbered, in merit order,
 * from 1. A student held back keeps the class and roll they have: they are
 * sitting the same year again, in the same seat.
 */
export function promotionPlan(input: PlanInput): Plan {
  const { fromClassId, toClassId, candidates } = input;
  const takeAnyway = new Set(input.takeAnyway ?? []);
  const alreadyThere = input.alreadyThere ?? [];
  const warnings: string[] = [];

  if (!fromClassId) {
    return { moves: [], problem: 'No class was chosen to move up.', warnings };
  }
  if (!candidates.length) {
    return { moves: [], problem: 'That class has no students on the roll.', warnings };
  }

  const archiving = toClassId === null;
  if (!archiving && alreadyThere.length) {
    return {
      moves: [],
      problem: `The next class already has ${alreadyThere.length} student(s) on `
        + 'its roll, so new roll numbers would collide with theirs. Move or '
        + 'archive them first.',
      warnings,
    };
  }

  const ranked = meritOrder(candidates);
  const going = ranked.filter(
    (c) => standing(c) === 'PASSED' || takeAnyway.has(c.studentId),
  );

  const held = ranked.length - going.length;
  if (held) {
    warnings.push(
      `${held} student(s) are staying down: they keep their class and roll `
      + 'number and will sit the year again.',
    );
  }
  const unranked = going.filter((c) => standing(c) !== 'PASSED').length;
  if (unranked) {
    warnings.push(
      `${unranked} student(s) are going up without a passing result, so they `
      + 'are placed at the bottom of the merit list.',
    );
  }

  let next = 0;
  const moves: Move[] = ranked.map((c) => {
    const takes = going.includes(c);
    if (!takes) {
      return {
        studentId: c.studentId,
        fullName: c.fullName,
        fromRoll: c.rollNo,
        standing: standing(c),
        toClassId: fromClassId,
        toRoll: null,
        what: 'STAYS' as const,
      };
    }
    if (archiving) {
      // Nowhere above this class: they have finished with the school, and
      // their roll number goes with them rather than being handed out again.
      return {
        studentId: c.studentId,
        fullName: c.fullName,
        fromRoll: c.rollNo,
        standing: standing(c),
        toClassId: null,
        toRoll: null,
        what: 'ARCHIVED' as const,
      };
    }
    next += 1;
    return {
      studentId: c.studentId,
      fullName: c.fullName,
      fromRoll: c.rollNo,
      standing: standing(c),
      toClassId,
      toRoll: next,
      what: 'UP' as const,
    };
  });

  return { moves, problem: '', warnings };
}

/**
 * The class above this one, by the number in its name.
 *
 * Read from the number rather than from the order the classes happen to be
 * stored in: "Class 10" sorts before "Class 6" as text, and a school that
 * adds a class later should not have its promotions quietly rewired.
 *
 * Returns null when there is nothing above -- which is the signal to archive.
 */
export function classNumberOf(className: string): number | null {
  const words: Record<string, number> = {
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const text = className.toLowerCase();
  for (const [word, n] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return n;
  }
  const digits = text.match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

export function nextClassAbove<T extends { classId: string; className: string; section?: string }>(
  here: T,
  classes: T[],
): T | null {
  const n = classNumberOf(here.className);
  if (n === null) return null;
  const above = classes
    .filter((c) => classNumberOf(c.className) === n + 1)
    // Same section where there is one, so 9-A goes to 10-A rather than 10-B.
    .sort((a, b) => Number((b.section ?? '') === (here.section ?? ''))
      - Number((a.section ?? '') === (here.section ?? '')));
  return above[0] ?? null;
}
