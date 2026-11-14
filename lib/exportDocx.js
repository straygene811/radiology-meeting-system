import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
  ImageRun
} from 'docx';

function dataUrlToUint8Array(dataUrl) {
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    return null;
  }
}

export async function generateMeetingDocxBlob(meeting, settings = {}, categoryLabel = '') {
  const hospitalName = settings?.hospitalName || '新樓基督教醫院';
  const departmentName = settings?.departmentName || '影像醫學科';

  const presentList = meeting.presentStaffNames || [];
  const leaveList = meeting.leaveStaffNames || [];
  const expectedCount = meeting.expectedCount || (presentList.length + leaveList.length) || presentList.length;
  const presentCount = presentList.length;
  const attendanceRate = expectedCount > 0 ? Math.round((presentCount / expectedCount) * 100) : 100;
  const signaturesMap = meeting.signatures || {};
  const signedList = Object.values(signaturesMap);

  const tableBorders = {
    top: { style: BorderStyle.SINGLE, size: 6, color: '64748B' },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: '64748B' },
    left: { style: BorderStyle.SINGLE, size: 6, color: '64748B' },
    right: { style: BorderStyle.SINGLE, size: 6, color: '64748B' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
  };

  const makeLabelCell = (text, widthPct = 18) =>
    new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, size: 22, font: 'Microsoft JhengHei' })]
        })
      ]
    });

  const makeValueCell = (text, widthPct = 32, colSpan = 1) =>
    new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      columnSpan: colSpan,
      children: [
        new Paragraph({
          children: [new TextRun({ text: String(text || '—'), size: 22, font: 'Microsoft JhengHei' })]
        })
      ]
    });

  // 1. 基本資訊公版表頭表格
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          makeLabelCell('會議名稱', 18),
          makeValueCell(meeting.title, 82, 3)
        ]
      }),
      new TableRow({
        children: [
          makeLabelCell('會議類別', 18),
          makeValueCell(categoryLabel || meeting.category, 32),
          makeLabelCell('開會時間', 18),
          makeValueCell(meeting.displayDate || `${meeting.date} ${meeting.time || ''}`, 32)
        ]
      }),
      new TableRow({
        children: [
          makeLabelCell('開會地點', 18),
          makeValueCell(meeting.location || '影像醫學科會議室', 32),
          makeLabelCell('會議主席 / 記錄', 18),
          makeValueCell(`主席：${meeting.chair || '—'} ／ 記錄：${meeting.recorder || '—'}`, 32)
        ]
      }),
      new TableRow({
        children: [
          makeLabelCell('應到 / 實到人數', 18),
          makeValueCell(`應到 ${expectedCount} 人 ／ 出席 ${presentCount} 人（值班/休假 ${leaveList.length} 人）`, 32),
          makeLabelCell('出席率 / 簽閱數', 18),
          makeValueCell(`出席率：${attendanceRate}% ／ 已線上簽閱：${signedList.length} 人`, 32)
        ]
      }),
      new TableRow({
        children: [
          makeLabelCell('出席人員名單', 18),
          makeValueCell(presentList.join('、') || '詳如簽到明細', 82, 3)
        ]
      }),
      ...(leaveList.length > 0
        ? [
            new TableRow({
              children: [
                makeLabelCell('值班/休假人員', 18),
                makeValueCell(leaveList.join('、'), 82, 3)
              ]
            })
          ]
        : [])
    ]
  });

  // 2. 議程與討論內容段落
  const contentChildren = [];

  if (meeting.agendaItems && meeting.agendaItems.length > 0) {
    contentChildren.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: '壹、會議議程主題', bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
      })
    );
    meeting.agendaItems.forEach((item) => {
      contentChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `• ${item}`, size: 22, font: 'Microsoft JhengHei' })]
        })
      );
    });
  }

  contentChildren.push(
    new Paragraph({
      spacing: { before: 280, after: 120 },
      children: [new TextRun({ text: '貳、會議討論內容與重點紀錄', bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
    })
  );

  (meeting.discussionSections || []).forEach((sec) => {
    contentChildren.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [new TextRun({ text: sec.heading, bold: true, size: 24, color: '0F172A', font: 'Microsoft JhengHei' })]
      })
    );
    (sec.bullets || []).forEach((b) => {
      contentChildren.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 },
          children: [new TextRun({ text: `▪ ${b}`, size: 22, font: 'Microsoft JhengHei' })]
        })
      );
    });
  });

  if (meeting.resolutions && meeting.resolutions.length > 0) {
    contentChildren.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: '參、會議決議事項', bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
      })
    );
    meeting.resolutions.forEach((res, idx) => {
      contentChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 240 },
          children: [new TextRun({ text: `${idx + 1}. ${res}`, bold: true, size: 22, font: 'Microsoft JhengHei' })]
        })
      );
    });
  }

  // 3. 待辦追蹤事項表格
  if (meeting.actionItems && meeting.actionItems.length > 0) {
    contentChildren.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: '肆、待辦追蹤事項 (Action Items)', bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
      })
    );
    const actionRows = [
      new TableRow({
        children: [
          makeLabelCell('項次', 10),
          makeLabelCell('待辦事項內容', 48),
          makeLabelCell('負責人員', 18),
          makeLabelCell('預計完成日', 12),
          makeLabelCell('進度狀態', 12)
        ]
      }),
      ...meeting.actionItems.map((item, idx) =>
        new TableRow({
          children: [
            makeValueCell(idx + 1, 10),
            makeValueCell(item.task, 48),
            makeValueCell(item.assignee, 18),
            makeValueCell(item.dueDate, 12),
            makeValueCell(item.status, 12)
          ]
        })
      )
    ];
    contentChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: actionRows
      })
    );
  }

  // 4. 三級主管審核簽章表格
  const approval = meeting.approvalChain || {};
  contentChildren.push(
    new Paragraph({
      spacing: { before: 320, after: 120 },
      children: [new TextRun({ text: '伍、會議紀錄三級審核簽章', bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({
          children: [
            makeLabelCell('紀錄人呈報', 33),
            makeLabelCell('會議主席覆核', 33),
            makeLabelCell('科主任最終核准', 34)
          ]
        }),
        new TableRow({
          children: [
            makeValueCell(
              approval.recorderSubmittedBy
                ? `${approval.recorderSubmittedBy}\n(${new Date(approval.recorderSubmittedAt).toLocaleString('zh-TW')})`
                : meeting.recorder || '待呈報',
              33
            ),
            makeValueCell(
              approval.chairApprovedBy
                ? `${approval.chairApprovedBy}\n(${new Date(approval.chairApprovedAt).toLocaleString('zh-TW')})`
                : '待主席覆核',
              33
            ),
            makeValueCell(
              approval.directorApprovedBy
                ? `${approval.directorApprovedBy}\n(${new Date(approval.directorApprovedAt).toLocaleString('zh-TW')})`
                : '待科主任簽核',
              34
            )
          ]
        })
      ]
    })
  );

  // 5. 同仁線上簽到與已閱簽核名冊（支援嵌入電子手寫簽名 PNG）
  contentChildren.push(
    new Paragraph({
      spacing: { before: 320, after: 120 },
      children: [new TextRun({ text: `陸、同仁手機線上簽到與簽閱紀錄（共 ${signedList.length} 人已簽核）`, bold: true, size: 26, color: '1E3A8A', font: 'Microsoft JhengHei' })]
    })
  );

  if (signedList.length > 0) {
    const sigRows = [
      new TableRow({
        children: [
          makeLabelCell('姓名', 16),
          makeLabelCell('簽核方式', 20),
          makeLabelCell('簽核時間', 24),
          makeLabelCell('電子簽名 / 意見回饋', 40)
        ]
      })
    ];

    for (const sig of signedList) {
      const cellParagraphs = [];
      if (sig.signatureDataUrl) {
        const imgBytes = dataUrlToUint8Array(sig.signatureDataUrl);
        if (imgBytes) {
          cellParagraphs.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBytes,
                  transformation: { width: 110, height: 42 },
                  type: 'png'
                })
              ]
            })
          );
        }
      }
      if (sig.comment) {
        cellParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: sig.comment, size: 20, font: 'Microsoft JhengHei' })]
          })
        );
      }
      if (cellParagraphs.length === 0) {
        cellParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: '已線上詳閱確認', size: 20, font: 'Microsoft JhengHei' })]
          })
        );
      }

      sigRows.push(
        new TableRow({
          children: [
            makeValueCell(sig.name, 16),
            makeValueCell(sig.method || '手機已閱簽認', 20),
            makeValueCell(sig.signedAt ? new Date(sig.signedAt).toLocaleString('zh-TW') : '—', 24),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              children: cellParagraphs
            })
          ]
        })
      );
    }

    contentChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: sigRows
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: `${hospitalName}　${departmentName}`,
                bold: true,
                size: 34,
                font: 'Microsoft JhengHei'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: meeting.title,
                bold: true,
                size: 28,
                color: '1E3A8A',
                font: 'Microsoft JhengHei'
              })
            ]
          }),
          infoTable,
          ...contentChildren
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
}

