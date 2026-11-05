# Kết quả triển khai theo kế hoạch

Ngày 01/10/2026. Nâng cấp từ commit `cf7c782` / tag `v0.1-baseline`. Bản triển khai đang ở working tree; chưa tạo commit/tag hoặc push bản nâng cấp.

## 1. Kết quả sáu ưu tiên

| FR | Kết quả code | Bằng chứng |
|---|---|---|
| FR-01 nhiều cấp | Engine chạy tuần tự, giao bước sau khi bước hiện tại đạt; tiến trình UI | Kiểm thử ba cấp, từ chối và quyền duyệt sớm |
| FR-02 điều kiện | Typed evaluator AND/OR, ngưỡng/ngày/rỗng, skip; mô phỏng dùng cùng rules | 52 rule checks; sim và execution; test ngưỡng |
| FR-03 song song | Task riêng từng người, ALL/ANY, hủy task dư; serialize request | Test đồng thời, ALL thiếu đồng ý/ANY một từ chối/tất cả từ chối |
| FR-04 resolver | 6 selector, hiệu lực/scope/self-user/dedup/mơ hồ | Test selector/quyền; BLOCKED/retry |
| FR-05 version | Draft revision, publish immutable, history/diff/restore, instance pinned | Test lưu nháp, v1/v2, stale revision, trigger |
| FR-06 bổ sung | RETURNED, dữ liệu từng vòng/diff, giữ mã/version, chạy lại từ đầu | Test round 1→2 đổi tuyến; idempotent submit; immutable snapshot |

Hai mẫu seed minh họa: `CP-MULTI`, `CP-ANY`. Tài khoản công ty vẫn 8 nhân sự cũ; CTO là chức danh có thể phân công/cấp role, không có thêm tài khoản CTO được giả tạo.

## 2. Đầu ra/chốt từng bước

| Gate | Công việc thực hiện | Kết quả chốt thực tế | Trạng thái |
|---|---|---|---|
| G0 | Git/source/docs, build/test baseline | cf7c782; backend/frontend build, 100 regression đạt | Đạt kỹ thuật |
| G1 | Dùng phạm vi kế hoạch, yêu cầu “triển khai code” | Sáu FR và hỗ trợ version/runtime/migration/UI/test | Đã dùng làm căn cứ |
| G2 | FR/BR/AC, use case/quyền | DEVELOPMENT_PLAN + SRS.md; nghĩa ALL/ANY/return/pin version | Đã hiện thực; chờ UAT nghiệp vụ |
| G3 | Phân tích trạng thái và luồng | diagrams.md, state trong kế hoạch, sequence WORKFLOW_DESIGN | Có source; walkthrough tự động đạt |
| G4 | Dữ liệu/API/ADR/transaction/migration | SQL005, Prisma, WORKFLOW_DESIGN/API/ClassDiagram | Build/generate/migration test đạt |
| G5 | UI enterprise theo ui-ux-pro-max | Workflow editor/simulation/version, progress/tasks/round/diff, A4 | Đã build; visual QA còn chờ |
| G6 B–E | Runtime/version/resolver/conditions/ALL/ANY/return | Sáu FR chạy API; UI nối các endpoint | Đạt kiểm thử tự động |
| G7 | Rules/regression/integration/migration/concurrency/load/restore | 322 kiểm tra có bộ đếm đạt, load đạt ngưỡng, restore checksum khớp | Tự động đạt; UI trực quan còn chờ |
| G8 | Chuẩn bị demo và UAT | DEMO.md, UAT.md với actual để trống | Chờ sinh viên thử |
| G9 | Backup, Docker build/up, migrate và health, Studio | Local Docker healthy; giữ 9 hồ sơ; Studio 5555 | Local đã chạy; máy thứ hai/release tag còn chờ |

Không ghi UAT hoặc nghiệm thu học phần là đã đạt. Các bước có code/test được xác minh độc lập với bước xác nhận người dùng.

## 3. Bằng chứng kỹ thuật

- `backend npm run prisma:generate`, `npm run build`: đạt.
- `frontend npm run build`: đạt, bao gồm guard điều hướng khi chưa lưu.
- Test: 100 nền + 52 rule + 15 migration + 155 advanced = 322 có bộ đếm. Load test có assert riêng.
- Load host 1.000 pending/20 session: p95 inbox 721ms, detail 154ms, decision 347ms, submit 1.153ms; điều kiện đo ở TESTING.md.
- Restore backup trước nâng cấp: 8 users/9 requests/25 audit; checksum request khớp.
- Local migration 001–005 applied; 8 legacy instance/task và 9 hồ sơ nguyên trạng; request audit cũ 22 giữ lại.
- Docker db/api/web healthy; login 3000 và health 3001 HTTP 200; Studio khởi động 5555.

Backup: `backups/pre-workflow-engine-20261001-091108.dump`, Git ignore. Nội dung và số liệu test đã được ghi trong TESTING.md; không dùng số dự kiến làm actual.

## 4. Quyết định cụ thể hóa kế hoạch

- Idempotent mutation replay trả **hồ sơ hiện tại**, không lặp tác dụng; không lưu toàn bộ response cũ. Key/hash/actor/action/request được lưu cùng lịch sử.
- Request revision được UI mới gửi; API một bước cũ có thể bỏ để giữ tương thích. Workflow draft/publish bắt buộc revision.
- Mẫu một bước mặc định đồng bộ version khi sửa mẫu. Quy trình nâng cao cần ban hành lại nếu template_version đổi; nháp giữ mẫu cũ báo mismatch và hướng dẫn tạo đơn mới.
- Ban hành kiểm tra cấu trúc/kiểu/tham chiếu tĩnh; người gửi cụ thể được preflight lúc gửi. Mô phỏng phát hiện thiếu người theo từng sender.
- Giao nhiệm vụ khi bước bắt đầu, giữ assignment snapshot; không tự chuyển giao khi đổi cơ cấu.
- Prisma introspection cần rà soát: composite FK published pointer cần explicit unique; User–EmployeeAssignment được chỉnh thành quan hệ nhiều phân công, giữ partial unique primary_assignment ở DB.

## 5. Các vấn đề phát hiện và xử lý trong triển khai

| Vấn đề | Sửa | Kiểm chứng |
|---|---|---|
| Prisma composite relation introspection không generate | Bổ sung unique(id,published_version_id) nhất quán SQL/schema | Generate/build |
| UI optional request và khối progress chèn vào editor | Narrow request; progress chỉ ở detail | Frontend typecheck/build |
| Test khóa tài khoản làm cookie cũ mất hiệu lực | Chuyển test sang chặn khóa khi task pending đúng nghiệp vụ | Integration |
| Quyền quản trị chỉ kiểm tra approver đơn | Chuyển sang toàn bộ task pending; role permission duyệt/return | Advanced/legacy tests |
| Simulation kiểm tra dữ liệu thiếu chặt | Dùng form-data validator chung | Typed simulation tests |
| Rời sidebar khi chưa lưu | Capture link navigation và xác nhận ở ba trình soạn | Source/build; UAT trực quan còn chờ |

## 6. Phần cần sinh viên thử và mở rộng

Sinh viên thử DEMO/UAT, đặc biệt mobile, focus/dialog, browser Back và A4 dài. Sau CR-02 ở cuối tài liệu, backlog còn email/SSO/chữ ký số/multi-tenant/BPMN tổng quát, lịch ngày làm việc/antivirus/object storage. SLA, chuyển giao/ủy quyền, tài liệu/trao đổi và báo cáo điểm chậm đã được bổ sung.

### Nhật ký xác minh cuối

- Docker build cuối và `docker compose up -d --wait`: thành công; db/api/web healthy.
- `docker compose exec -T api node tests/run.mjs`: exit 0; 52 rule + 15 migration + 100 regression + 155 advanced = **322 kiểm tra đạt**. DB kiểm thử riêng đã được xóa.
- Load trong container: 1.000 hồ sơ pending, 20 session đồng thời; p95 inbox **624 ms**, detail **131 ms**, decision **350 ms**, submit **711 ms**. Tất cả dưới ngưỡng kế hoạch.
- HTTP cuối: `/login` cổng 3000, `/api/health` cổng 3001 và Prisma Studio cổng 5555 đều 200.
- DB demo sau lần chạy cuối: 8 users, 9 requests, 8 workflow instances, 8 approval tasks; trạng thái các hồ sơ cũ giữ nguyên. Migration 001–005 đã áp dụng; CP-MULTI và CP-ANY ACTIVE.
- Class diagram có source PlantUML và sơ đồ tổng quan SVG/PNG; source/schema/API đã cập nhật. Các mục UAT trực quan vẫn chưa nghiệm thu.


## 7. CR-02 — bốn chức năng vận hành

Yêu cầu bổ sung của sinh viên ngày 01/10/2026. Mục 1–6 ở trên ghi đợt sáu chức năng; đợt này mở rộng phần 9–12 của danh sách ban đầu, 7–8 đã tích hợp ở đợt trước.

| Chức năng | Kết quả | Bằng chứng |
|---|---|---|
| FR-09 SLA | Thời hạn/nhắc trước/chuyển cấp cấu hình từng bước, worker 30 giây, sự kiện deduplicate, giữ task nếu target sai | Deadline, tick lặp, escalation, final task, invalid target |
| FR-10 Ủy quyền/chuyển giao | Lịch của mình, overlap/max window/quyền, áp dụng task mới và cũ, task thay thế giữ hạn, lịch sử/ALL/ANY đúng | Scope/self/duplicate, revoke/future, race transfer/decision |
| FR-11 Tài liệu/trao đổi | Bytea + SHA256, version theo document, snapshot theo vòng, archive, download có quyền, comment bất biến/notification | Bytes/MIME/path/Base64/UTF8, round v1/v2, stale revision, trigger, visibility |
| FR-12 Báo cáo | StepRun theo khoảng, TB/p95 đã kết thúc, active wait, returned/vi phạm/tỷ lệ, quyền báo cáo giao visibility | Aggregate và scope, invalid range, link request |

### Chốt các bước

- **Yêu cầu:** WORKFLOW_GUIDE và mục 20 của DEVELOPMENT_PLAN mô tả cả 12 chức năng, SRS thêm FR-09–12/AC. Chưa giả định canvas/BPMN/email/business calendar đã có.
- **Thiết kế:** ADR-09–12, SQL006, Prisma, API/permission, ClassDiagram và ERD mở rộng. User vẫn có nhiều EmployeeAssignment sau introspection.
- **Code/UI:** OperationsService, task-operations, step SLA editor, Delegations/Metrics và collaboration trong request detail; proxy download giữ headers và giới hạn body 3 MiB. Khi cần chứng từ, lưu draft trước rồi upload ở detail.
- **Kiểm thử host:** 100 nền + 52 rules + 15 migration + 155 advanced + **180 operations = 502 đạt**; load sau tối ưu inbox/ANALYZE: p95 inbox 488ms, detail 144ms, decision 376ms, submit 1.316ms.
- **Vấn đề tải:** Hai lượt host trước tối ưu không đạt inbox (17.252ms và 40.515ms), một lượt giữa chúng đạt 695ms. Đổi inbox membership ARRAY thành EXISTS để planner dùng semi-join và ANALYZE fixture sau bulk insert để đo với thống kê mới. Không suy luận các lần trên chứng minh SLA production; xem TESTING.
- **Migration/bàn giao:** Backup trước 006: backups/pre-workflow-operations-20261001.dump (Git ignore). Docker cuối đã build/up healthy, kiểm thử và bảo toàn dữ liệu được xác minh bên dưới.
- **UAT:** Chưa xác minh trực quan mobile/keyboard/A4 trên browser; UAT.md có thêm ca CR-02 với actual chưa thực hiện. Chưa commit/push bản nâng cấp.


### CR-02 — xác minh Docker cuối

- api/web build thành công; `docker compose up -d --wait`: db/api/web healthy, migration 001–006 áp dụng.
- `docker compose exec -T api node tests/run.mjs`: exit 0, **502 checks đạt** (180 operations). DB tạm đã xóa.
- Load container với ANALYZE fixture: p95 inbox **611ms**, detail **139ms**, decision **329ms**, submit **781ms**; 1.000 pending/20 sessions, dưới ngưỡng read 1.000ms/mutation 2.000ms.
- DB demo giữ 8 users/9 requests/8 instances/8 tasks, các trạng thái REQ-2026-00001–00008 và draft không đổi. Backup trước 006: 91.829 byte, Git ignore.
- HTTP `/login` 3000, `/api/health` 3001, Studio 5555: 200. Smoke qua Next proxy: CDO login/metrics/delegations thành công.
- Source class diagram cập nhật tại docs/ClassDiagram.puml và Document/ClassDiagram_TLCN.puml. Kế hoạch chứa cách hoạt động cả 12 chức năng, hướng dẫn độc lập ở WORKFLOW_GUIDE.md; 16 Markdown kiểm tra UTF-8/fences/link hợp lệ.

Phần browser/mobile/keyboard/A4 UAT và máy thứ hai chưa xác minh. Chưa commit/push bản nâng cấp.


## 8. Dữ liệu trình bày ngày 13/10/2026

Theo yêu cầu tập trung cấu hình workflow, chuẩn bị MS-BV-01 bằng tài khoản CEO: mẫu v1, workflow v2 với 4 bước, selector DIRECT_MANAGER/ROLE/POSITION, điều kiện AND/OR, đồng duyệt ALL, SLA. Tạo role PROCUREMENT_REVIEWER với đúng 3 permission quyết định; Hoàng được cấp scope ORGANIZATION để xử lý task liên phòng ban được giao, không thêm quyền quản trị hoặc REQUEST_VIEW toàn công ty.

Script chuẩn bị tạo metadata role bằng SQL, form/workflow/grant/request/attachment/decision qua API có session đúng người. 7 mô phỏng đạt (3m, 5m, 19.999.999, 20m, 35m, khẩn và ngoài kế hoạch); 5 hồ sơ giả lập: 2 approved, 1 pending CEO, 1 returned, 1 draft. Trong case 35m, sau một trong hai task ALL đồng ý, hồ sơ vẫn pending và CEO chưa có task; sau đủ hai task mới giao CEO. Để task cuối cho sinh viên trình bày.

10 request trước chuẩn bị giữ nguyên id/status/code/form_data. Backup trước chuẩn bị: backups/pre-defense-demo-20261013.dump, Git ignore. README/DEMO dẫn tới DEFENSE_DEMO.md; manifest có cấu hình và kết quả mô phỏng ở docs/defense-demo/prepared.json, không chứa cookie/password. Số 502 thuộc bộ test đợt trước, không coi là số kiểm thử chạy lại trong lần cấu hình dữ liệu này.

Tên đề tài chỉ đề xuất trong tài liệu; chưa đổi tên chính thức toàn bộ báo cáo. Kiểm chứng API/dữ liệu; chưa thêm browser/mobile/A4 UAT trong lần này.


## 9. CR-04 — cấu hình workflow bằng flow (13/10/2026)

Theo ảnh tham khảo: bổ sung canvas React Flow, node và kết nối điều kiện/skip/song song/hợp kết quả, panel chọn bước, flow/list cùng definition, undo/redo, zoom/minimap/fullscreen và layout local theo assignment/workflow. Inspector dùng lại controls và endpoint đã có. Node positions không biến thành business order; edges sinh từ thứ tự/when/mode. Giới hạn mô hình schemaVersion 1 và happy path được nêu ngay ở canvas/WORKFLOW_CANVAS.md.

103 projection checks đạt; lint/typecheck và frontend build đạt. Docker web build cuối/up --no-deps --wait đạt, web healthy. Client chunk `.next/static/chunks/425vs5yk83h0s.js` chứa canvas; CSS canvas hiện diện. HTTP localhost:3000/workflows, 127.0.0.1:3000/workflows và API health 3001 đều 200. npm/pnpm lockfiles cập nhật @xyflow/react 12.12.0. npm audit báo 2 high tại Next/source-map-js, đã ghi trong TESTING.md; không tuyên bố security gate đạt.

Sửa lỗi TypeScript suy luận state node quá rộng, kiểm tra lại build đạt; thêm kiểm tra lane bypass ngoài 12 nhánh, chọn bước sau save được giữ. Chưa có browser interaction/visual QA cho kéo/keyboard/fullscreen/mobile. UAT và hướng dẫn thao tác ở WORKFLOW_CANVAS.md. Không thực hiện migration nghiệp vụ trong đợt UI này; workflow/form/hồ sơ demo dùng cấu hình đã có.


## 10. Tên sản phẩm ORVA (13/10/2026)

Người dùng chốt ORVA là tên website. Cập nhật tên sản phẩm tại sidebar, đăng nhập/đăng ký, màn hình chờ, footer, metadata trình duyệt, dòng ghi nguồn tài liệu và tên file CSV xuất. Logo chữ dùng ký tự O. README dùng tên ORVA.

Tên doanh nghiệp demo FlowPilot Corporation và dữ liệu lịch sử giữ theo dữ liệu công ty hiện có; tên sản phẩm độc lập với tên công ty. Các định danh kỹ thuật, tài khoản, cơ sở dữ liệu và khóa lưu cục bộ giữ tương thích.

Kiểm chứng: frontend build (gồm TypeScript) đạt; Docker web build và up --no-deps --wait đạt, container healthy. HTTP /login trên localhost:3000 và 127.0.0.1:3000 đều 200, title là ORVA · Quản lý phê duyệt. Chưa kiểm tra trực quan trong trình duyệt cho đợt đổi tên này.


## 11. Hoàn thiện workflow cho buổi demo ORVA (13/10/2026)

Đối chiếu MS-BV-01 thực tế xác nhận điều kiện gắn đúng bước, nháp giống published v2. Cải thiện nhãn gate/skip/participant theo số bước, focus đúng gate + node của một stepId, thanh chọn bước và tiêu đề inspector; giữ sidebar cuộn và reset về đầu khi đổi bước/tab. Thêm MoneyInput tái sử dụng tại FormInputs và ngưỡng điều kiện, hiển thị vi-VN nhưng dữ liệu số giữ nguyên. Font Be Vietnam Pro local có giấy phép OFL, CSS enterprise và nút 100%.

113 graph checks + 28 money checks đạt; build/TypeScript và Docker web cuối đạt, web healthy. HTTP/CSS/4 font asset xác minh. Browser CEO kiểm tra bước 1/2, sidebar cuộn tới cuối và đổi tab về đầu, toàn màn hình, mô phỏng 12m và 35m hợp lệ. Không tạo request/lưu/ban hành cấu hình khi kiểm tra; cuối nháp vẫn revision 4. Ảnh tại docs/screenshots/orva-workflow-step2.jpg. Chi tiết hành vi/giới hạn ở WORKFLOW_CANVAS.md. Chưa chạy lại đầy đủ backend/UAT mobile 375px/A4; các số kiểm thử cũ giữ là lịch sử, không coi là lần chạy mới.


## 12. Sửa số thứ tự bước bị lặp (13/10/2026)

Người dùng xác nhận lỗi UI hiển thị `1. 01 · …`: ol tự đánh số, trong khi tên bước demo có tiền tố số cũ. Dùng workflowStepName để bỏ tiền tố kiểu `01 ·`, `1. ` hoặc `1) ` khi hiển thị tên trong danh sách, thanh chọn bước, dropdown, inspector, input tên bước, node và kết quả/lịch sử có đánh số. Không sửa definition, stepId hoặc published version khi hiển thị.

115 graph checks đạt (thêm kiểm tra nhãn không lặp và definition không bị sửa), TypeScript đạt. Browser xác minh MS-BV-01: mỗi dòng chỉ có một số 1–4, tên node/dropdown/input đồng nhất và nháp vẫn revision 4. Ảnh: docs/screenshots/orva-workflow-numbering.jpg.

Docker web build/up đạt, container healthy; /workflows trên localhost và 127.0.0.1 trả HTTP 200 sau triển khai.
