import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  Lock,
  Play,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  CompletionRule,
  Course,
  CourseModule,
  Lesson,
  LessonType,
  QuizQuestion,
} from '../../types';
import { downloadCsv } from '../../utils/rbac';
import { ImageUploadField } from '../common/ImageUploadField';
import { UserAvatar } from '../common/UserAvatar';

type LmsTab = 'catalog' | 'builder' | 'reporting';

const slugifyFilename = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const inferExtensionFromMime = (mime: string, fallback: string): string => {
  const normalized = mime.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/zip': 'zip',
  };
  return map[normalized] || fallback;
};

const dataUrlToBlob = (dataUrl: string): { blob: Blob; mimeType: string } => {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URL');
  }
  const header = dataUrl.slice(5, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const isBase64 = header.includes(';base64');
  const mimeType = header.split(';')[0] || 'application/octet-stream';

  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { blob: new Blob([bytes], { type: mimeType }), mimeType };
  }

  return { blob: new Blob([decodeURIComponent(payload)], { type: mimeType }), mimeType };
};

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const LearningView: React.FC = () => {
  const {
    state,
    currentUser,
    canEdit,
    createCourse,
    updateCourse,
    deleteCourse,
    enrollInCourse,
    toggleLessonCompletion,
    submitQuizAttempt,
    notify,
  } = useAppStore();

  const editable = canEdit('learning');
  const [tab, setTab] = useState<LmsTab>('catalog');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Course Player State
  const [playingCourseId, setPlayingCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [lastAttemptResult, setLastAttemptResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [certificateCourseId, setCertificateCourseId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const exportCertRef = useRef<HTMLDivElement>(null);

  // Course Builder State
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [builderForm, setBuilderForm] = useState<Omit<Course, 'id' | 'createdAt'>>({
    title: '',
    category: 'Technical Engineering',
    description: '',
    status: 'Draft',
    prerequisiteCourseIds: [],
    completionRule: 'Both',
    autoAssignNewJoiners: false,
    certificateBgOverride: '',
    modules: [],
    quiz: { passingScore: 70, questions: [] },
  });

  const categories = useMemo(
    () => Array.from(new Set(state.courses.map((c) => c.category))),
    [state.courses]
  );

  const visibleCourses = useMemo(
    () =>
      state.courses
        .filter((c) => (editable ? true : c.status === 'Published'))
        .filter((c) => (categoryFilter === 'all' ? true : c.category === categoryFilter)),
    [state.courses, editable, categoryFilter]
  );

  const playingCourse = useMemo(
    () => state.courses.find((c) => c.id === playingCourseId),
    [state.courses, playingCourseId]
  );

  const playingEnrollment = useMemo(
    () =>
      playingCourse
        ? state.enrollments.find((e) => e.userId === currentUser.id && e.courseId === playingCourse.id)
        : undefined,
    [state.enrollments, currentUser.id, playingCourse]
  );

  const activePlayerLesson = useMemo(() => {
    if (!playingCourse) return undefined;
    const all = playingCourse.modules.flatMap((m) => m.lessons);
    return all.find((l) => l.id === activeLessonId) ?? all[0];
  }, [playingCourse, activeLessonId]);

  const pdfPreviewUrl = useMemo(() => {
    if (!activePlayerLesson || activePlayerLesson.type !== 'pdf' || !activePlayerLesson.content.trim()) {
      return null;
    }
    const content = activePlayerLesson.content.trim();
    if (content.startsWith('data:application/pdf')) {
      try {
        const { blob } = dataUrlToBlob(content);
        return { url: URL.createObjectURL(blob), isObjectUrl: true };
      } catch {
        return null;
      }
    }
    return { url: content, isObjectUrl: false };
  }, [activePlayerLesson]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl?.isObjectUrl) {
        URL.revokeObjectURL(pdfPreviewUrl.url);
      }
    };
  }, [pdfPreviewUrl]);

  const handleDownloadLessonAsset = async (
    content: string,
    title: string,
    fallbackExt: string
  ) => {
    const trimmed = content.trim();
    if (!trimmed) {
      notify('No downloadable file is attached to this lesson.', 'error');
      return;
    }

    const baseName = slugifyFilename(title) || 'lesson-resource';

    if (trimmed.startsWith('data:')) {
      try {
        const { blob, mimeType } = dataUrlToBlob(trimmed);
        const ext = inferExtensionFromMime(mimeType, fallbackExt);
        triggerBlobDownload(blob, `${baseName}.${ext}`);
        notify(`Downloaded ${baseName}.${ext}`);
      } catch {
        notify('Could not decode lesson file for download.', 'error');
      }
      return;
    }

    try {
      const response = await fetch(trimmed);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const ext = inferExtensionFromMime(blob.type, fallbackExt);
      triggerBlobDownload(blob, `${baseName}.${ext}`);
      notify(`Downloaded ${baseName}.${ext}`);
    } catch {
      const anchor = document.createElement('a');
      anchor.href = trimmed;
      anchor.download = `${baseName}.${fallbackExt}`;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const handleDownloadTextLessonPdf = (courseTitle: string, lesson: Lesson) => {
    if (!lesson.content.trim()) {
      notify('This lesson has no text content to export.', 'error');
      return;
    }
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(3, 105, 161);
    pdf.text(courseTitle.toUpperCase(), margin, y);
    y += 7;

    pdf.setFont('times', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(17, 24, 39);
    const titleLines = pdf.splitTextToSize(lesson.title, maxWidth);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 7 + 4;

    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 8;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(55, 65, 81);
    const bodyLines = pdf.splitTextToSize(lesson.content, maxWidth);
    for (const line of bodyLines) {
      if (y > pageHeight - 18) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(String(line), margin, y);
      y += 5.5;
    }

    const fileName = `${slugifyFilename(lesson.title) || 'lesson-content'}.pdf`;
    pdf.save(fileName);
    notify(`Downloaded ${fileName}`);
  };

  const handleDownloadCourseContentPdf = (course: Course) => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    const ensureSpace = (neededMm: number) => {
      if (y + neededMm > pageHeight - 18) {
        pdf.addPage();
        y = 20;
      }
    };

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(3, 105, 161);
    pdf.text(`${course.category.toUpperCase()} • COURSE MATERIAL`, margin, y);
    y += 7;

    pdf.setFont('times', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(17, 24, 39);
    const courseTitleLines = pdf.splitTextToSize(course.title, maxWidth);
    pdf.text(courseTitleLines, margin, y);
    y += courseTitleLines.length * 8 + 3;

    if (course.description.trim()) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(75, 85, 99);
      const descLines = pdf.splitTextToSize(course.description.trim(), maxWidth);
      for (const line of descLines) {
        ensureSpace(6);
        pdf.text(String(line), margin, y);
        y += 5;
      }
      y += 3;
    }

    pdf.setDrawColor(209, 213, 219);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 8;

    course.modules.forEach((mod, mIdx) => {
      ensureSpace(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(17, 24, 39);
      const modLines = pdf.splitTextToSize(`${mIdx + 1}. ${mod.title}`, maxWidth);
      pdf.text(modLines, margin, y);
      y += modLines.length * 6 + 3;

      mod.lessons.forEach((les, lIdx) => {
        ensureSpace(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 58, 138);
        const lesHeader = `${mIdx + 1}.${lIdx + 1} ${les.title} (${les.type.toUpperCase()} • ${les.durationMinutes}m)`;
        const lesHeaderLines = pdf.splitTextToSize(lesHeader, maxWidth);
        pdf.text(lesHeaderLines, margin, y);
        y += lesHeaderLines.length * 5.5 + 2;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(55, 65, 81);

        if (les.type === 'text' && les.content.trim()) {
          const contentLines = pdf.splitTextToSize(les.content.trim(), maxWidth);
          for (const line of contentLines) {
            ensureSpace(6);
            pdf.text(String(line), margin, y);
            y += 5;
          }
        } else if (les.content.trim()) {
          const note = les.content.startsWith('data:')
            ? `[Attached ${les.type.toUpperCase()} resource — available for direct download inside the lesson player.]`
            : `Resource: ${les.content}`;
          const noteLines = pdf.splitTextToSize(note, maxWidth);
          for (const line of noteLines) {
            ensureSpace(6);
            pdf.text(String(line), margin, y);
            y += 5;
          }
        } else {
          ensureSpace(6);
          pdf.text('No additional content attached.', margin, y);
          y += 5;
        }
        y += 4;
      });
      y += 2;
    });

    const fileName = `${slugifyFilename(course.title) || 'course'}-content.pdf`;
    pdf.save(fileName);
    notify(`Downloaded ${fileName}`);
  };

  const openCoursePlayer = (course: Course) => {
    const enrolled = state.enrollments.find(
      (e) => e.userId === currentUser.id && e.courseId === course.id
    );
    if (!enrolled) {
      enrollInCourse(currentUser.id, course.id);
    }
    setPlayingCourseId(course.id);
    const firstLesson = course.modules[0]?.lessons[0]?.id ?? null;
    setActiveLessonId(firstLesson);
    setQuizOpen(false);
    setQuizAnswers({});
    setLastAttemptResult(null);
  };

  const openBuilderForCourse = (course: Course | null) => {
    if (course) {
      setEditingCourse(course);
      setBuilderForm({
        title: course.title,
        category: course.category,
        description: course.description,
        status: course.status,
        prerequisiteCourseIds: course.prerequisiteCourseIds,
        completionRule: course.completionRule,
        autoAssignNewJoiners: course.autoAssignNewJoiners,
        certificateBgOverride: course.certificateBgOverride,
        modules: JSON.parse(JSON.stringify(course.modules)),
        quiz: JSON.parse(JSON.stringify(course.quiz)),
      });
    } else {
      setEditingCourse(null);
      setBuilderForm({
        title: '',
        category: 'Technical Engineering',
        description: '',
        status: 'Draft',
        prerequisiteCourseIds: [],
        completionRule: 'Both',
        autoAssignNewJoiners: false,
        certificateBgOverride: '',
        modules: [
          {
            id: `mod-${Date.now()}`,
            title: 'Module 1: Core Foundations',
            order: 1,
            lessons: [
              {
                id: `les-${Date.now()}`,
                title: 'Introduction Manual',
                type: 'text',
                durationMinutes: 10,
                content: 'Enter lesson guidance and operational checklist here.',
                order: 1,
              },
            ],
          },
        ],
        quiz: { passingScore: 70, questions: [] },
      });
    }
    setTab('builder');
  };

  const handleSaveCourseBuilder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !builderForm.title.trim()) return;
    if (editingCourse) {
      updateCourse(editingCourse.id, builderForm);
    } else {
      const created = createCourse(builderForm);
      setEditingCourse(created);
    }
  };

  const handleUploadLessonMedia = (
    modIdx: number,
    lesIdx: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const nextMods = [...builderForm.modules];
      nextMods[modIdx].lessons[lesIdx].content = reader.result;
      setBuilderForm({ ...builderForm, modules: nextMods });
      notify(`Loaded media file "${file.name}"`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExportReportingCsv = () => {
    const rows = state.enrollments.map((enr) => {
      const u = state.users.find((usr) => usr.id === enr.userId);
      const c = state.courses.find((crs) => crs.id === enr.courseId);
      const totalLessons = c ? c.modules.reduce((acc, m) => acc + m.lessons.length, 0) : 0;
      const pct = totalLessons > 0 ? Math.round((enr.completedLessonIds.length / totalLessons) * 100) : 100;
      const bestScore =
        enr.quizAttempts.length > 0 ? Math.max(...enr.quizAttempts.map((a) => a.score)) : '—';
      return [
        u?.fullName ?? enr.userId,
        u?.email ?? '',
        c?.title ?? enr.courseId,
        `${pct}%`,
        bestScore,
        enr.passed ? 'Certified' : 'In Progress',
        enr.completedAt ? enr.completedAt.slice(0, 10) : '',
      ];
    });
    downloadCsv(
      'department-os-lms-report.csv',
      ['Staff Name', 'Email', 'Course', 'Lesson Progress', 'Best Quiz Score', 'Status', 'Completed Date'],
      rows
    );
    notify('Exported LMS reporting CSV');
  };

  const certificateCourse = certificateCourseId
    ? state.courses.find((c) => c.id === certificateCourseId)
    : undefined;
  const certificateEnrollment = certificateCourse
    ? state.enrollments.find((e) => e.userId === currentUser.id && e.courseId === certificateCourse.id)
    : undefined;

  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const formatCertificateDate = (isoOrDateStr: string): string => {
    const datePart = isoOrDateStr.slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (match) {
      const year = match[1];
      const monthIdx = Number(match[2]) - 1;
      const day = String(Number(match[3])).padStart(2, '0');
      const monthName = MONTH_NAMES[monthIdx] ?? match[2];
      return `On ${day}-${monthName}-${year}`;
    }
    const d = new Date(isoOrDateStr);
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const monthName = MONTH_NAMES[d.getMonth()];
      return `On ${day}-${monthName}-${d.getFullYear()}`;
    }
    return `On ${isoOrDateStr}`;
  };

  const renderCertificateStage = (
    bgUrl: string,
    recipientName: string,
    courseTitle: string,
    completionDate: string,
    printable: boolean
  ) => (
    <div
      className={`cert-container relative w-full aspect-[2631/1860] bg-white text-neutral-900 overflow-hidden rounded-lg border border-neutral-200 shadow-sm ${
        printable ? 'certificate-print-area' : ''
      }`}
    >
      <img
        src={bgUrl || state.branding.defaultCertificateBg}
        alt="Certificate Background"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-fill"
      />

      {/* Recipient Name Zone — between "THIS CERTIFICATE IS HEREBY BESTOWED UPON" and "FOR SUCCESSFULLY COMPLETING THE COURSE" */}
      <div
        className="absolute inset-x-0 z-10 flex items-center justify-center px-[9%] text-center"
        style={{ top: '43%', height: '15.5%' }}
      >
        <div
          className="font-certificate-script text-[#172554] leading-[1.08] tracking-wide truncate max-w-full"
          style={{ fontSize: '6.4cqw' }}
        >
          {recipientName}
        </div>
      </div>

      {/* Course Title & Completion Date Zone — below "FOR SUCCESSFULLY COMPLETING THE COURSE" */}
      <div
        className="absolute inset-x-0 z-10 flex flex-col items-center justify-start px-[12%] text-center"
        style={{ top: '63.8%', height: '16%' }}
      >
        <h3
          className="font-certificate-serif font-bold text-[#1e3a8a] leading-snug max-w-[88%] line-clamp-2"
          style={{ fontSize: '2.65cqw' }}
        >
          {courseTitle}
        </h3>
        <div
          className="font-certificate-serif text-[#334155] leading-normal"
          style={{ fontSize: '1.75cqw', marginTop: '0.9cqw' }}
        >
          {formatCertificateDate(completionDate)}
        </div>
      </div>
    </div>
  );

  const handleDownloadCertificatePdf = async () => {
    if (!exportCertRef.current || !certificateCourse) return;
    setDownloadingPdf(true);
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(exportCertRef.current.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );

      const dataUrl = await toJpeg(exportCertRef.current, {
        pixelRatio: 2,
        quality: 0.96,
        backgroundColor: '#ffffff',
        width: 1123,
        height: 794,
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      pdf.addImage(dataUrl, 'JPEG', 0, 0, 297, 210);
      const slug = certificateCourse.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      pdf.save(`${slug || 'course'}-certificate.pdf`);
      notify('Certificate PDF downloaded');
    } catch {
      notify('Could not generate PDF. Try using Print / Save as PDF instead.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const certificateModal =
    certificateCourse && certificateEnrollment ? (
      <>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/75" onClick={() => setCertificateCourseId(null)} />
          <div className="relative z-10 w-full max-w-4xl rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                A4 Landscape Certificate
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={handleDownloadCertificatePdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{downloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCertificateCourseId(null)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  aria-label="Close certificate preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {renderCertificateStage(
              certificateCourse.certificateBgOverride || state.branding.defaultCertificateBg,
              currentUser.fullName,
              certificateCourse.title,
              (certificateEnrollment.completedAt ?? new Date().toISOString()).slice(0, 10),
              true
            )}
          </div>
        </div>

        {/* Fixed 1123x794 off-screen A4 landscape stage for pixel-accurate PDF capture */}
        <div
          aria-hidden="true"
          className="fixed left-[-99999px] top-0 pointer-events-none select-none"
        >
          <div
            ref={exportCertRef}
            className="relative bg-white text-neutral-900 overflow-hidden"
            style={{ width: '1123px', height: '794px' }}
          >
            <img
              src={certificateCourse.certificateBgOverride || state.branding.defaultCertificateBg}
              alt=""
              className="absolute inset-0 w-full h-full object-fill"
            />
            <div
              className="absolute inset-x-0 z-10 flex items-center justify-center px-[100px] text-center"
              style={{ top: '341px', height: '123px' }}
            >
              <div
                className="font-certificate-script text-[#172554] leading-[1.08] tracking-wide truncate max-w-full"
                style={{ fontSize: '72px' }}
              >
                {currentUser.fullName}
              </div>
            </div>
            <div
              className="absolute inset-x-0 z-10 flex flex-col items-center justify-start px-[135px] text-center"
              style={{ top: '506px', height: '130px' }}
            >
              <h3
                className="font-certificate-serif font-bold text-[#1e3a8a] leading-snug max-w-[820px]"
                style={{ fontSize: '30px' }}
              >
                {certificateCourse.title}
              </h3>
              <div
                className="font-certificate-serif text-[#334155] leading-normal"
                style={{ fontSize: '20px', marginTop: '10px' }}
              >
                {formatCertificateDate(
                  (certificateEnrollment.completedAt ?? new Date().toISOString()).slice(0, 10)
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    ) : null;

  // Course Player Sub-View
  if (playingCourse && playingEnrollment) {
    const allLessons = playingCourse.modules.flatMap((m) => m.lessons);
    const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? allLessons[0];
    const completedCount = playingEnrollment.completedLessonIds.length;
    const allLessonsDone =
      allLessons.length === 0 ||
      allLessons.every((l) => playingEnrollment.completedLessonIds.includes(l.id));
    const quizUnlocked = allLessonsDone;

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => setPlayingCourseId(null)}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              ← Back to Course Catalog
            </button>
            <h2 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
              {playingCourse.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono-tabular text-neutral-500">
              {completedCount}/{allLessons.length} Lessons Completed
            </span>
            {(allLessons.length > 0 || playingCourse.description.trim().length > 0) && (
              <button
                type="button"
                onClick={() => handleDownloadCourseContentPdf(playingCourse)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap shrink-0"
                title="Download full course syllabus & text content as PDF"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Course Content PDF</span>
              </button>
            )}
            {playingEnrollment.passed && (
              <button
                type="button"
                onClick={() => setCertificateCourseId(playingCourse.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Award className="h-4 w-4" />
                <span>View Certificate</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Syllabus Sidebar */}
          <aside className="lg:col-span-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-zinc-800 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Course Curriculum
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {playingCourse.modules.map((mod) => (
                <div key={mod.id} className="p-3 space-y-1.5">
                  <div className="px-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {mod.title}
                  </div>
                  {mod.lessons.map((les) => {
                    const done = playingEnrollment.completedLessonIds.includes(les.id);
                    const isCurr = !quizOpen && activeLesson?.id === les.id;
                    return (
                      <button
                        key={les.id}
                        type="button"
                        onClick={() => {
                          setQuizOpen(false);
                          setActiveLessonId(les.id);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                          isCurr
                            ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 font-medium'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-neutral-300 dark:text-zinc-600 shrink-0" />
                          )}
                          <span className="truncate">{les.title}</span>
                        </span>
                        <span className="font-mono-tabular text-[11px] text-neutral-400 shrink-0">
                          {les.durationMinutes}m
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Final Assessment Gate */}
              {playingCourse.quiz.questions.length > 0 && (
                <div className="p-3">
                  <button
                    type="button"
                    disabled={!quizUnlocked}
                    onClick={() => {
                      setQuizOpen(true);
                      setLastAttemptResult(null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      quizOpen
                        ? 'bg-sky-600 text-white'
                        : quizUnlocked
                          ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20'
                          : 'bg-neutral-100 dark:bg-zinc-900 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {!quizUnlocked && <Lock className="h-3.5 w-3.5" />}
                      <span>Final Assessment Quiz</span>
                    </span>
                    <span className="font-mono-tabular">Pass: {playingCourse.quiz.passingScore}%</span>
                  </button>
                  {!quizUnlocked && (
                    <p className="mt-1.5 px-1 text-[11px] text-neutral-400">
                      Complete 100% of lessons to unlock the quiz.
                    </p>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* Right Content / Quiz Stage */}
          <section className="lg:col-span-8 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6">
            {quizOpen ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-base font-display font-bold text-neutral-900 dark:text-neutral-100">
                      Course Certification Assessment
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Passing score required:{' '}
                      <span className="font-mono-tabular font-semibold">{playingCourse.quiz.passingScore}%</span>
                    </p>
                  </div>
                </div>

                {lastAttemptResult && (
                  <div
                    className={`rounded-lg border p-4 text-sm flex flex-wrap items-center justify-between gap-3 ${
                      lastAttemptResult.passed
                        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                    }`}
                  >
                    <div>
                      <strong>
                        {lastAttemptResult.passed ? 'Assessment Passed!' : 'Did not meet passing score.'}
                      </strong>{' '}
                      Your score: <span className="font-mono-tabular font-bold">{lastAttemptResult.score}%</span>
                    </div>
                    {lastAttemptResult.passed ? (
                      <button
                        type="button"
                        onClick={() => setCertificateCourseId(playingCourse.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold"
                      >
                        Open Certificate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setQuizAnswers({});
                          setLastAttemptResult(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-zinc-800 text-white text-xs font-medium"
                      >
                        Retry Quiz
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-5">
                  {playingCourse.quiz.questions.map((q, qIdx) => (
                    <div key={q.id} className="space-y-2.5">
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {qIdx + 1}. {q.prompt}
                      </div>
                      <div className="space-y-1.5">
                        {q.options.map((opt, oIdx) => (
                          <label
                            key={oIdx}
                            className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                              quizAnswers[qIdx] === oIdx
                                ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-500/10 text-neutral-900 dark:text-neutral-100'
                                : 'border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              checked={quizAnswers[qIdx] === oIdx}
                              onChange={() => setQuizAnswers({ ...quizAnswers, [qIdx]: oIdx })}
                              className="accent-sky-600"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      Object.keys(quizAnswers).length < playingCourse.quiz.questions.length
                    }
                    onClick={() => {
                      const answersArr = playingCourse.quiz.questions.map((_, i) => quizAnswers[i] ?? -1);
                      const res = submitQuizAttempt(currentUser.id, playingCourse.id, answersArr);
                      setLastAttemptResult({ score: res.score, passed: res.passed });
                    }}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-40"
                  >
                    Submit Assessment
                  </button>
                </div>
              </div>
            ) : activeLesson ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-zinc-800 pb-4">
                  <div>
                    <span className="text-xs font-medium text-sky-600 dark:text-sky-400 uppercase">
                      {activeLesson.type} Lesson
                    </span>
                    <h3 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {activeLesson.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeLesson.type === 'text' && activeLesson.content.trim() && (
                      <button
                        type="button"
                        onClick={() => handleDownloadTextLessonPdf(playingCourse.title, activeLesson)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download PDF</span>
                      </button>
                    )}

                    {activeLesson.type === 'pdf' && activeLesson.content.trim() && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadLessonAsset(activeLesson.content, activeLesson.title, 'pdf')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download PDF</span>
                      </button>
                    )}

                    {activeLesson.type === 'image' && activeLesson.content.trim() && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadLessonAsset(activeLesson.content, activeLesson.title, 'png')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Image</span>
                      </button>
                    )}

                    {activeLesson.type === 'video' &&
                      (activeLesson.content.startsWith('data:video') ||
                        /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(activeLesson.content.trim())) && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadLessonAsset(activeLesson.content, activeLesson.title, 'mp4')
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download Video</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        toggleLessonCompletion(currentUser.id, playingCourse.id, activeLesson.id)
                      }
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        playingEnrollment.completedLessonIds.includes(activeLesson.id)
                          ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                          : 'bg-sky-600 hover:bg-sky-700 text-white'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {playingEnrollment.completedLessonIds.includes(activeLesson.id)
                          ? 'Completed'
                          : 'Mark Lesson Complete'}
                      </span>
                    </button>
                  </div>
                </div>

                {activeLesson.type === 'text' && (
                  activeLesson.content.trim() ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      {activeLesson.content}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 dark:border-zinc-800 p-6 text-center text-xs text-neutral-500">
                      No written content added to this lesson yet.
                    </div>
                  )
                )}

                {activeLesson.type === 'video' && (
                  activeLesson.content.trim() ? (
                    <div className="aspect-video w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-zinc-800 bg-black">
                      {activeLesson.content.startsWith('data:video') ? (
                        <video src={activeLesson.content} controls className="w-full h-full" />
                      ) : (
                        <iframe
                          src={activeLesson.content}
                          title={activeLesson.title}
                          className="w-full h-full"
                          allowFullScreen
                        />
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 dark:border-zinc-800 p-6 text-center text-xs text-neutral-500">
                      No video uploaded or linked to this lesson yet.
                    </div>
                  )
                )}

                {activeLesson.type === 'image' && (
                  activeLesson.content.trim() ? (
                    <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 overflow-hidden bg-neutral-50 dark:bg-black p-3">
                      <img
                        src={activeLesson.content}
                        alt={activeLesson.title}
                        referrerPolicy="no-referrer"
                        className="max-h-[420px] mx-auto rounded object-contain"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 dark:border-zinc-800 p-6 text-center text-xs text-neutral-500">
                      No image uploaded for this lesson yet.
                    </div>
                  )
                )}

                {activeLesson.type === 'pdf' && (
                  activeLesson.content.trim() ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 p-5 bg-neutral-50 dark:bg-black flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-8 w-8 text-sky-600 dark:text-sky-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {activeLesson.title}
                            </div>
                            <div className="text-xs text-neutral-500">PDF Reference Document</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadLessonAsset(activeLesson.content, activeLesson.title, 'pdf')
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download PDF</span>
                          </button>
                          {!activeLesson.content.startsWith('data:') && (
                            <a
                              href={activeLesson.content}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium whitespace-nowrap"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Open</span>
                            </a>
                          )}
                        </div>
                      </div>
                      {pdfPreviewUrl && (
                        <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 overflow-hidden bg-white">
                          <iframe
                            src={pdfPreviewUrl.url}
                            title={activeLesson.title}
                            className="w-full h-[520px]"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 dark:border-zinc-800 p-6 text-center text-xs text-neutral-500">
                      No PDF file attached to this lesson yet.
                    </div>
                  )
                )}

                {activeLesson.type === 'link' && (
                  <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 p-6 bg-neutral-50 dark:bg-black flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        External Reference Resource
                      </div>
                      <div className="text-xs text-neutral-500 truncate mt-0.5">
                        {activeLesson.content || 'No URL provided'}
                      </div>
                    </div>
                    {activeLesson.content.trim() && (
                      <a
                        href={activeLesson.content}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white text-xs font-medium shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open Link</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-neutral-500">No lessons in this course yet.</div>
            )}
          </section>
        </div>

        {certificateModal}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top LMS Tabs */}
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'catalog'
                ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Course Catalog</span>
          </button>
          {editable && (
            <>
              <button
                type="button"
                onClick={() => openBuilderForCourse(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'builder'
                    ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Course Builder</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('reporting')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'reporting'
                    ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>LMS Reporting</span>
              </button>
            </>
          )}
        </div>

        {tab === 'catalog' && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}

        {tab === 'reporting' && (
          <button
            type="button"
            onClick={handleExportReportingCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Reporting CSV</span>
          </button>
        )}
      </div>

      {/* TAB 1: COURSE CATALOG */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleCourses.map((course) => {
            const enrollment = state.enrollments.find(
              (e) => e.userId === currentUser.id && e.courseId === course.id
            );
            const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
            const pct =
              enrollment && totalLessons > 0
                ? Math.round((enrollment.completedLessonIds.length / totalLessons) * 100)
                : 0;

            const unmetPrereq = course.prerequisiteCourseIds.find(
              (pid) => !state.enrollments.some((e) => e.userId === currentUser.id && e.courseId === pid && e.passed)
            );
            const prereqCourse = unmetPrereq ? state.courses.find((c) => c.id === unmetPrereq) : undefined;

            return (
              <div
                key={course.id}
                className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium text-sky-600 dark:text-sky-400">{course.category}</span>
                    <span>
                      {course.status} · {course.completionRule}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                    {course.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-3">
                    {course.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                    <span>{course.modules.length} module(s)</span>
                    <span>·</span>
                    <span>{totalLessons} lesson(s)</span>
                    {course.autoAssignNewJoiners && (
                      <>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Auto-Assign New Joiners</span>
                      </>
                    )}
                  </div>

                  {prereqCourse && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2.5 py-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Prerequisite: {prereqCourse.title}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-zinc-800">
                  {enrollment && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono-tabular text-neutral-500">
                        <span>{enrollment.passed ? 'Certified' : 'Progress'}</span>
                        <span>{enrollment.passed ? '100%' : `${pct}%`}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-zinc-900 overflow-hidden">
                        <div
                          className={`h-full ${enrollment.passed ? 'bg-amber-500' : 'bg-sky-600 dark:bg-sky-500'}`}
                          style={{ width: `${enrollment.passed ? 100 : pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={Boolean(prereqCourse) || course.status === 'Draft'}
                      onClick={() => openCoursePlayer(course)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-40"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>
                        {enrollment ? (enrollment.passed ? 'Review Course' : 'Continue') : 'Enroll & Start'}
                      </span>
                    </button>

                    {enrollment?.passed && (
                      <button
                        type="button"
                        onClick={() => setCertificateCourseId(course.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold shrink-0"
                        title="Open & Download Certificate PDF"
                      >
                        <Award className="h-3.5 w-3.5" />
                        <span>Certificate</span>
                      </button>
                    )}

                    {!prereqCourse &&
                      (course.status === 'Published' || editable) &&
                      (totalLessons > 0 || course.description.trim().length > 0) && (
                        <button
                          type="button"
                          onClick={() => handleDownloadCourseContentPdf(course)}
                          className="p-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900 shrink-0"
                          title="Download Course Content PDF"
                          aria-label={`Download ${course.title} content PDF`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}

                    {editable && (
                      <>
                        <button
                          type="button"
                          onClick={() => openBuilderForCourse(course)}
                          className="p-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900 shrink-0"
                          title="Edit in Course Builder"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCourse(course.id)}
                          className="p-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                          title="Delete Course"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleCourses.length === 0 && (
            <div className="col-span-full rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-12 text-center space-y-3">
              <BookOpen className="h-9 w-9 text-neutral-300 dark:text-zinc-700 mx-auto" />
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                No courses created yet
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Create structured training modules and certification assessments in the Course Builder.
              </p>
              {editable && (
                <button
                  type="button"
                  onClick={() => openBuilderForCourse(null)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Course</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COURSE BUILDER */}
      {tab === 'builder' && editable && (
        <form onSubmit={handleSaveCourseBuilder} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Course Metadata & Modules */}
            <div className="lg:col-span-7 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  {editingCourse ? `Editing: ${editingCourse.title}` : 'Create New LMS Course'}
                </h3>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  Save Course
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Course Title</label>
                  <input
                    required
                    type="text"
                    value={builderForm.title}
                    onChange={(e) => setBuilderForm({ ...builderForm, title: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Category</label>
                  <input
                    required
                    type="text"
                    value={builderForm.category}
                    onChange={(e) => setBuilderForm({ ...builderForm, category: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Status</label>
                  <select
                    value={builderForm.status}
                    onChange={(e) =>
                      setBuilderForm({ ...builderForm, status: e.target.value as 'Draft' | 'Published' })
                    }
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Completion Rule</label>
                  <select
                    value={builderForm.completionRule}
                    onChange={(e) =>
                      setBuilderForm({ ...builderForm, completionRule: e.target.value as CompletionRule })
                    }
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="All Lessons">All Lessons</option>
                    <option value="Quiz Pass">Quiz Pass</option>
                    <option value="Both">Both (All Lessons & Quiz Pass)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={builderForm.description}
                  onChange={(e) => setBuilderForm({ ...builderForm, description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={builderForm.autoAssignNewJoiners}
                    onChange={(e) =>
                      setBuilderForm({ ...builderForm, autoAssignNewJoiners: e.target.checked })
                    }
                    className="accent-sky-600"
                  />
                  <span>Auto-assign to new joiners</span>
                </label>
              </div>

              {/* Modules & Ordered Lessons */}
              <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Modules & Lessons
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const newMod: CourseModule = {
                        id: `mod-${Date.now()}`,
                        title: `Module ${builderForm.modules.length + 1}`,
                        order: builderForm.modules.length + 1,
                        lessons: [],
                      };
                      setBuilderForm({ ...builderForm, modules: [...builderForm.modules, newMod] });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Module
                  </button>
                </div>

                {builderForm.modules.map((mod, mIdx) => (
                  <div
                    key={mod.id}
                    className="rounded-lg border border-neutral-200 dark:border-zinc-800 p-4 space-y-3 bg-neutral-50/70 dark:bg-black"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={mod.title}
                        onChange={(e) => {
                          const next = [...builderForm.modules];
                          next[mIdx].title = e.target.value;
                          setBuilderForm({ ...builderForm, modules: next });
                        }}
                        className="flex-1 rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-2.5 py-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...builderForm.modules];
                          const newLes: Lesson = {
                            id: `les-${Date.now()}`,
                            title: 'New Lesson',
                            type: 'text',
                            durationMinutes: 5,
                            content: '',
                            order: next[mIdx].lessons.length + 1,
                          };
                          next[mIdx].lessons.push(newLes);
                          setBuilderForm({ ...builderForm, modules: next });
                        }}
                        className="px-2.5 py-1 rounded bg-sky-600 text-white text-xs font-medium"
                      >
                        + Lesson
                      </button>
                    </div>

                    {mod.lessons.map((les, lIdx) => (
                      <div
                        key={les.id}
                        className="rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={les.title}
                            onChange={(e) => {
                              const next = [...builderForm.modules];
                              next[mIdx].lessons[lIdx].title = e.target.value;
                              setBuilderForm({ ...builderForm, modules: next });
                            }}
                            placeholder="Lesson title"
                            className="flex-1 min-w-[160px] rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1 text-xs text-neutral-900 dark:text-neutral-100"
                          />
                          <select
                            value={les.type}
                            onChange={(e) => {
                              const next = [...builderForm.modules];
                              next[mIdx].lessons[lIdx].type = e.target.value as LessonType;
                              setBuilderForm({ ...builderForm, modules: next });
                            }}
                            className="rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100"
                          >
                            <option value="text">Text Manual</option>
                            <option value="video">Video Embed/Upload</option>
                            <option value="pdf">PDF/File</option>
                            <option value="image">Image</option>
                            <option value="link">External Link</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...builderForm.modules];
                              next[mIdx].lessons = next[mIdx].lessons.filter((_, i) => i !== lIdx);
                              setBuilderForm({ ...builderForm, modules: next });
                            }}
                            className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {les.type === 'text' ? (
                          <textarea
                            rows={2}
                            value={les.content}
                            onChange={(e) => {
                              const next = [...builderForm.modules];
                              next[mIdx].lessons[lIdx].content = e.target.value;
                              setBuilderForm({ ...builderForm, modules: next });
                            }}
                            placeholder="Lesson manual content..."
                            className="w-full rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black p-2 text-xs text-neutral-900 dark:text-neutral-100"
                          />
                        ) : les.type === 'image' ? (
                          <ImageUploadField
                            value={les.content}
                            onChange={(dataUrl) => {
                              const next = [...builderForm.modules];
                              next[mIdx].lessons[lIdx].content = dataUrl;
                              setBuilderForm({ ...builderForm, modules: next });
                            }}
                            emptyHint="Upload an image slide or diagram"
                            previewAspect="landscape"
                            optimizeOptions={{ maxWidth: 1200, maxHeight: 900, quality: 0.85 }}
                            onError={(msg) => notify(msg, 'error')}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={les.content}
                              onChange={(e) => {
                                const next = [...builderForm.modules];
                                next[mIdx].lessons[lIdx].content = e.target.value;
                                setBuilderForm({ ...builderForm, modules: next });
                              }}
                              placeholder={les.type === 'link' ? 'Enter reference URL...' : 'Enter URL or upload file...'}
                              className="flex-1 rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1 text-xs text-neutral-900 dark:text-neutral-100"
                            />
                            {(les.type === 'video' || les.type === 'pdf') && (
                              <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-200 dark:border-zinc-800 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-zinc-900">
                                <Upload className="h-3 w-3" />
                                <span>Upload</span>
                                <input
                                  type="file"
                                  accept={les.type === 'video' ? 'video/*' : 'application/pdf'}
                                  className="hidden"
                                  onChange={(e) => handleUploadLessonMedia(mIdx, lIdx, e)}
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Quiz Builder + Certificate Settings & Live Preview */}
            <div className="lg:col-span-5 space-y-6">
              {/* Quiz Builder */}
              <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                    Quiz Builder
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <span>Pass %:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={builderForm.quiz.passingScore}
                      onChange={(e) =>
                        setBuilderForm({
                          ...builderForm,
                          quiz: { ...builderForm.quiz, passingScore: Number(e.target.value) },
                        })
                      }
                      className="w-16 font-mono-tabular rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-neutral-900 dark:text-neutral-100"
                    />
                  </div>
                </div>

                {builderForm.quiz.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="rounded-lg border border-neutral-200 dark:border-zinc-800 p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={q.prompt}
                        onChange={(e) => {
                          const nextQ = [...builderForm.quiz.questions];
                          nextQ[qIdx].prompt = e.target.value;
                          setBuilderForm({
                            ...builderForm,
                            quiz: { ...builderForm.quiz, questions: nextQ },
                          });
                        }}
                        placeholder="Question prompt"
                        className="flex-1 rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-neutral-900 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBuilderForm({
                            ...builderForm,
                            quiz: {
                              ...builderForm.quiz,
                              questions: builderForm.quiz.questions.filter((_, i) => i !== qIdx),
                            },
                          });
                        }}
                        className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={q.correctIndex === oIdx}
                          onChange={() => {
                            const nextQ = [...builderForm.quiz.questions];
                            nextQ[qIdx].correctIndex = oIdx;
                            setBuilderForm({
                              ...builderForm,
                              quiz: { ...builderForm.quiz, questions: nextQ },
                            });
                          }}
                          className="accent-sky-600"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const nextQ = [...builderForm.quiz.questions];
                            nextQ[qIdx].options[oIdx] = e.target.value;
                            setBuilderForm({
                              ...builderForm,
                              quiz: { ...builderForm.quiz, questions: nextQ },
                            });
                          }}
                          className="flex-1 rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-neutral-900 dark:text-neutral-100"
                        />
                      </div>
                    ))}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const newQ: QuizQuestion = {
                      id: `q-${Date.now()}`,
                      prompt: 'New multiple-choice question?',
                      options: ['Option A', 'Option B', 'Option C', 'Option D'],
                      correctIndex: 0,
                    };
                    setBuilderForm({
                      ...builderForm,
                      quiz: {
                        ...builderForm.quiz,
                        questions: [...builderForm.quiz.questions, newQ],
                      },
                    });
                  }}
                  className="w-full py-2 rounded-lg border border-dashed border-neutral-300 dark:border-zinc-700 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                >
                  + Add Quiz Question
                </button>
              </div>

              {/* Certificate Background & Live Preview */}
              <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 space-y-3">
                <h4 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  Certificate Live Preview
                </h4>

                <ImageUploadField
                  label="Custom Certificate Background (Optional)"
                  value={builderForm.certificateBgOverride}
                  onChange={(certificateBgOverride) =>
                    setBuilderForm({ ...builderForm, certificateBgOverride })
                  }
                  emptyHint="Using Workspace Default Certificate BG"
                  previewAspect="landscape"
                  optimizeOptions={{ maxWidth: 1400, maxHeight: 1000, quality: 0.85 }}
                  onError={(msg) => notify(msg, 'error')}
                />

                {renderCertificateStage(
                  builderForm.certificateBgOverride || state.branding.defaultCertificateBg,
                  currentUser.fullName,
                  builderForm.title || 'Course Title Preview',
                  new Date().toISOString().slice(0, 10),
                  false
                )}
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: LMS REPORTING */}
      {tab === 'reporting' && editable && (
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Course</th>
                <th className="py-3 px-4">Lesson Completion</th>
                <th className="py-3 px-4">Best Quiz Score</th>
                <th className="py-3 px-4">Certification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800 text-sm">
              {state.enrollments.map((enr) => {
                const user = state.users.find((u) => u.id === enr.userId);
                const course = state.courses.find((c) => c.id === enr.courseId);
                const total = course ? course.modules.reduce((acc, m) => acc + m.lessons.length, 0) : 0;
                const pct = total > 0 ? Math.round((enr.completedLessonIds.length / total) * 100) : 100;
                const best =
                  enr.quizAttempts.length > 0 ? Math.max(...enr.quizAttempts.map((a) => a.score)) : null;

                return (
                  <tr key={enr.id} className="hover:bg-neutral-50 dark:hover:bg-zinc-900/60">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={user?.fullName ?? 'Staff'}
                          avatarUrl={user?.avatarUrl}
                          size="xs"
                        />
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {user?.fullName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-700 dark:text-neutral-300">
                      {course?.title}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs">
                      {enr.completedLessonIds.length}/{total} ({pct}%)
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs">
                      {best !== null ? `${best}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {enr.passed ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Certified ({enr.completedAt?.slice(0, 10)})
                        </span>
                      ) : (
                        <span className="text-neutral-500">In Progress</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {state.enrollments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No course enrollments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {certificateModal}
    </div>
  );
};
