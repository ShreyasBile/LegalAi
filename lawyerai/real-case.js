/* =============================================================================
   A REAL CASE to try every feature on: Rajendra S/o Ramdas Kolhe v. State of Maharashtra,
   Criminal Appeal No. 2281 of 2011, Supreme Court of India, decided 15 May 2024
   ([2024] 6 S.C.R. 740 : 2024 INSC 422). Appeal from the Bombay High Court, Aurangabad Bench.

   Everything here comes from the judgment itself (the Supreme Court's published text, on the AWS Open Data
   registry, CC-BY-4.0) or from the case-law database: the facts, the dates, the arguments of both sides as the
   Court records them (para 7), and the eight judgments the Court relies on, each of which is a record in the database.
   Nothing is invented. The ratings and notes say where in the judgment each point is.

   The documents are not pre-loaded, so that Add evidence can be tried: the files are in the sample-case folder.
   Loaded after app.js and before workbench.js, so the matter is there when the workbench loads what you saved.
   ============================================================================= */
MATTERS.push({
  id: 'm9', title: 'Rajendra Kolhe v. State of Maharashtra', court: 'Supreme Court of India', caseNo: 'Crl. A. No. 2281 of 2011',
  area: 'Criminal · Appeal against conviction (s.302 IPC)', stage: 4, lead: 'Shreyas A.', leadInitials: 'SA', updated: 'Real case',
  nextHearing: null,
  tags: ['Real case', 'Dying declaration', 'Supreme Court record'],
  facts: {
    objective: 'Challenge the conviction under Section 302 read with Section 34 IPC (life imprisonment), which rests on the deceased’s written dying declaration (Ex. 59) and on oral statements she is said to have made to five witnesses.',
    relief: 'Set aside the judgment of the Bombay High Court (Aurangabad Bench) dated 15.11.2010 in Criminal Appeal No. 635 of 2008, which upheld the trial court’s judgment of 23.07.2008, and acquit the appellant.',
    issue: 'Whether the dying declaration (Ex. 59) is a valid piece of evidence on which a conviction can rest, given that the prosecution witnesses improved on their police statements and the doctor’s endorsement gives 11:45 PM as the time at both ends of the recording.'
  },
  authorities: [
    { key: 'db-878', title: 'Khushal Rao v. The State of Bombay', meta: '1958 · [1958] 1 S.C.R. 552 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D1958/english/1958_1_552_570_EN.pdf',
      note: 'Relied on. The principles for accepting a dying declaration: it can be the sole basis of conviction without corroboration, must be judged on its own facts, and must not be the result of tutoring (para 27).' },
    { key: 'db-16180', title: 'Kundula Bala Subrahmanyam v. State of Andhra Pradesh', meta: '1993 · [1993] 2 S.C.R. 666 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D1993/english/1993_2_666_691_EN.pdf',
      note: 'Relied on. A dying declaration has a special sanctity; if true and free from embellishment it can by itself support a conviction (para 29).' },
    { key: 'db-28276', title: 'Sher Singh v. State of Punjab', meta: '2008 · [2008] 2 S.C.R. 959 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2008/english/2008_2_959_970_EN.pdf',
      note: 'Relied on. A declaration made in extremity is more readily accepted, so oath and cross-examination are dispensed with (para 30).' },
    { key: 'db-32911', title: 'Sudhakar v. State of Madhya Pradesh', meta: '2012 · [2012] 7 S.C.R. 128 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2012/english/2012_7_128_159_EN.pdf',
      note: 'Relied on. Once voluntary and reliable it can form the basis of conviction, more so where corroborated (para 31). The index spells the name “Shudhakar”.' },
    { key: 'db-15808', title: 'Paniben (Smt.) v. State of Gujarat', meta: '1992 · [1992] 2 S.C.R. 197 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D1992/english/1992_2_197_209_EN.pdf',
      note: 'Referred to. No rule of law or prudence bars acting on a dying declaration without corroboration, but it must not be the result of tutoring, prompting or imagination (para 28).' },
    { key: 'db-28088', title: 'Amol Singh v. State of Madhya Pradesh', meta: '2008 · [2008] 8 S.C.R. 956 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2008/english/2008_8_956_961_EN.pdf',
      note: 'Referred to. With more than one dying declaration, reliability matters, not plurality; examine whether the inconsistencies are material (para 32).' },
    { key: 'db-30892', title: 'Lakhan v. State of Madhya Pradesh', meta: '2010 · [2010] 9 S.C.R. 705 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2010/english/2010_9_705_722_EN.pdf',
      note: 'Referred to. Where several declarations are inconsistent, scrutinise the facts carefully and decide which is worth reliance (para 33).' },
    { key: 'db-33194', title: 'Ashabai v. State of Maharashtra', meta: '2013 · [2013] 1 S.C.R. 115 · Supreme Court of India', pdfUrl: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year%3D2013/english/2013_1_115_129_EN.pdf',
      note: 'Referred to. Each of several dying declarations is assessed on its own merit; one is not rejected merely because of variations in another (para 34).' },
    { key: 'sec-32', title: 'Section 32(1), Indian Evidence Act, 1872', meta: 'Statute · Bare Act',
      note: 'A statement by a person since dead about the cause of death or the circumstances of the transaction is relevant, whether or not she expected to die (para 26).' }
  ],
  arguments: [
    { point: 'The prosecution witnesses contradict each other and improved on their police statements.', strength: 35,
      support: 'PW-2, PW-3, PW-4, PW-7 and PW-8 each said things in court that are not in their Section 161 statements (judgment paras 10 to 14, 19).',
      stressTest: 'The Court’s answer: improvements exist, but they are not material and converge on the core of the dying declaration. Identical statements after five years could even suggest tutoring (paras 19.5, 24, 35).' },
    { point: 'The dying declaration recorded by the Special Executive Magistrate (Ex. 65) was not proved, so the High Court rightly did not rely on it.', strength: 50,
      support: 'The High Court did not accept Ex. 65 (paras 7, 16).',
      stressTest: 'The Court did not need to examine Ex. 65: the conviction rests on Ex. 59 (para 16).' },
    { point: 'The doctor’s endorsement gives 11:45 PM as the time at both the start and the end of recording Ex. 59, a serious lacuna.', strength: 40,
      support: 'PW-12 gave 11:45 PM for both points; PW-13 said the second endorsement was a mistake (paras 7, 17, 23).',
      stressTest: 'The Court accepted PW-13’s explanation: Ex. 59 was proved by PW-6, PW-12 and PW-13, and PW-13’s evidence was not shaken in cross-examination (paras 17.1, 24).' },
    { point: 'There was no reason for the appellant to harm his wife, and he tried to save her.', strength: 30,
      support: 'The courts below discarded the cruelty theory; the appellant burnt his right hand and took her to hospital (para 7).',
      stressTest: 'The Court relied on the deceased’s own account in Ex. 59, which names the appellant and the brother-in-law (paras 20, 24).' }
  ],
  counterArgs: [
    { point: 'Ex. 59 is too significant to be overlooked, and minor discrepancies cannot impeach the prosecution case (the State’s submission, para 7.1).',
      rebuttal: 'The doctor’s own endorsements carry one time at both ends, and five witnesses added details after five years. Those go to whether the declaration is credible and free of tutoring.' },
    { point: 'The oral dying declarations to PW-2, PW-3, PW-4, PW-7 and PW-8 corroborate Ex. 59.',
      rebuttal: 'Ex. 59 says the husband and brother-in-law ran away; PW-7 and PW-8 put them at the house and say they took her to hospital, while PW-2 and PW-7 say they were not at the hospital. Each of these witnesses also left details out of the police statement (paras 19 to 19.4).' },
    { point: 'A dying declaration alone can sustain a conviction without corroboration (Khushal Rao, Paniben, Kundula Bala Subrahmanyam).',
      rebuttal: 'Only if it is voluntary, consistent, credible and free of tutoring (para 25). Press the inconsistencies and the possibility of prompting.' }
  ],
  tasks: [
    { label: 'Surrender before the trial court by 29 May 2024 (two weeks from 15 May 2024)', done: false },
    { label: 'Obtain a certified copy of the judgment of 15 May 2024', done: false },
    { label: 'Check the Supreme Court Rules for the period and grounds of a review petition', done: false }
  ],
  strengths: [],
  documents: [],
  timeline: [
    { date: '22 Jul 2002', iso: '2002-07-22', title: 'The deceased suffers burn injuries (about 8:30 PM); Crime No. 182/2002 registered at Ambajogai Police Station', note: 'Taken to hospital; her written statement Ex. 59 is recorded at 11:45 PM by PW-6 with the doctor’s endorsements. The FIR first names Sections 307, 498A, 342, 323 and 504 read with 34 IPC.', source: 'Judgment paras 3.1, 17, 21', flag: false },
    { date: '22 Jul 2002', iso: '2002-07-22', title: 'Where were the husband and brother-in-law? The accounts differ', note: 'Ex. 59: they ran away. PW-8: standing near the door; PW-7: in the house, and they went with her in the auto. PW-2 and PW-7: not at the hospital when they arrived.', source: 'Judgment paras 10, 13, 14, 20.2', flag: true },
    { date: '24 Jul 2002', iso: '2002-07-24', title: 'The deceased dies at about 11:00 PM; Section 302 IPC is added to the FIR', note: 'A second dying declaration (Ex. 65) was recorded earlier by the Special Executive Magistrate; the High Court did not accept it.', source: 'Judgment paras 3.2, 16', flag: false },
    { date: '25 Jul 2002', iso: '2002-07-25', title: 'Supplementary statement of PW-8 recorded by the police', note: '', source: 'Judgment para 14', flag: false },
    { date: '23 Jul 2008', iso: '2008-07-23', title: 'Trial court convicts the appellant under Section 302 read with Section 34 IPC', note: 'Life imprisonment and a fine of Rs 25,000. 3rd Ad Hoc Additional Sessions Judge, Ambajogai, Sessions Case No. 60/2006. The father-in-law, mother-in-law and sister-in-law are acquitted; the brother-in-law, a juvenile, is sent to the Juvenile Justice Board.', source: 'Judgment paras 2, 3.3, 3.5', flag: false },
    { date: '15 Nov 2010', iso: '2010-11-15', title: 'Bombay High Court (Aurangabad Bench) dismisses Criminal Appeal No. 635 of 2008', note: 'Relies on Ex. 59 and the oral dying declarations to PW-2, PW-3, PW-4, PW-7 and PW-8.', source: 'Judgment para 4', flag: false },
    { date: '16 Aug 2011', iso: '2011-08-16', title: 'Supreme Court issues notice in Criminal Appeal No. 2281 of 2011', note: '', source: 'Judgment para 5', flag: false },
    { date: '02 Oct 2011', iso: '2011-10-02', title: 'Leave granted; the prayer for bail is rejected', note: '', source: 'Judgment para 5', flag: false },
    { date: '30 Jun 2016', iso: '2016-06-30', title: 'Sentence suspended and bail granted after about nine years in custody', note: '', source: 'Judgment para 6', flag: false },
    { date: '15 May 2024', iso: '2024-05-15', title: 'Supreme Court dismisses the appeal; the appellant must surrender within two weeks', note: 'Abhay S. Oka and Ujjal Bhuyan JJ. The dying declaration Ex. 59 is held a valid piece of evidence and the guilt proved beyond reasonable doubt.', source: 'Judgment paras 35 to 37', flag: false }
  ],
  drafts: [],
  postJudgment: {
    outcome: 'dismissed', outcomeLabel: 'Appeal dismissed', judgmentDate: '15 May 2024',
    summary: 'The Supreme Court held that Ex. 59 was a valid dying declaration: it was proved by PW-6, PW-12 and PW-13, the doctor certified that she was fit to speak, and its substance is borne out by her medical history (Ex. 117). The witnesses’ improvements and inconsistencies were not material, and a dying declaration found voluntary, consistent and credible can be the sole basis of conviction. The appellant, on bail since 2016, was directed to surrender within two weeks.',
    grounds: [], appealDeadline: '',
    nextSteps: [
      { label: 'Surrender before the trial court by 29 May 2024', done: false },
      { label: 'Obtain a certified copy of the judgment', done: false },
      { label: 'Check the Supreme Court Rules for a review petition', done: false }
    ]
  }
});
