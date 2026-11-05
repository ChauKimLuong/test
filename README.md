# ORVA — Website phê duyệt nội bộ

Website chạy bằng **Next.js 16 + NestJS 11 + Prisma ORM 7 + PostgreSQL 17**, đóng gói bằng Docker Compose. Giao diện tiếng Việt, có thiết kế biểu mẫu và bản in A4.

## Khởi động nhanh trên Windows

Cần Docker Desktop đang cài và bật Linux containers.

```powershell
cd C:\Users\xiaomi\Study\Uni\Y4\TLCN\PrjectDemo
.\start.ps1
```

Script tìm Docker CLI, khởi động Docker Desktop nếu cần, tạo `.env` từ `.env.example` khi chưa có, build và chờ các dịch vụ sẵn sàng.

Mở **http://localhost:3000**. Lần đầu cần tải image và dependencies.

Cách chạy trực tiếp nếu Docker đã có trong PATH:

```powershell
Copy-Item .env.example .env  # Chỉ làm lần đầu, không ghi đè .env đã chỉnh
docker compose up -d --build --wait
```

### Tài khoản demo

Mật khẩu chung khi seed lần đầu: **`Demo@2026!`** (hoặc giá trị `DEMO_PASSWORD` đã đặt trong `.env`).

| Email | Nhân sự | Vai trò |
|---|---|---|
| `ceo@flowpilot.vn` | Trần Đức An · CEO | Tổ chức, nhân sự, phân quyền; tạo/ban hành/sửa mẫu; tạo và duyệt yêu cầu được giao |
| `cdo@flowpilot.vn` | Lê Mai Anh · CDO | Tạo/ban hành/sửa mẫu; thẩm định đề xuất; tạo yêu cầu; cấu hình workflow |
| `linh@flowpilot.vn` | Nguyễn Thu Linh · Trưởng phòng Sản phẩm | Tạo mẫu/đơn; duyệt đơn từ nhóm Sản phẩm |
| `hoang@flowpilot.vn` | Phạm Quốc Hoàng · Trưởng phòng Kinh doanh | Tạo mẫu/đơn; duyệt đơn từ nhóm Kinh doanh |
| `huy@flowpilot.vn`, `mai@flowpilot.vn` | Nhân viên nhóm Sản phẩm | Thiết kế mẫu, gửi thẩm định, tạo yêu cầu |
| `minh@flowpilot.vn`, `thao@flowpilot.vn` | Nhân viên nhóm Khách hàng | Thiết kế mẫu, gửi thẩm định, tạo yêu cầu |

Quản trị viên không thể quyết định thay người được giao duyệt. Đổi `DEMO_PASSWORD` không đổi mật khẩu của tài khoản đã seed; dùng màn hình Cài đặt tài khoản.

## Chức năng

**Tạo mẫu đơn mới:** mọi thành viên đang hoạt động vào **Tạo mẫu đơn mới**. Nhân viên lưu nháp và chọn cấp trên hoặc lãnh đạo thẩm định. CEO/CDO hoặc người có quyền `FORM_PUBLISH` chọn người duyệt yêu cầu rồi **Ban hành mẫu** để dùng ngay. Người được giao thẩm định được sửa mẫu chờ; người có `FORM_EDIT_ANY` sửa được mẫu dùng chung. Mỗi lần sửa tạo phiên bản mới; đơn đã tạo giữ bản lưu nội dung mẫu cũ. Xem [ma trận quyền](docs/PERMISSIONS.md).

- Tự đăng ký → CEO phân công → cấp vai trò → kích hoạt → đăng nhập. Tài khoản chờ kích hoạt không thể truy cập. Session lưu trong PostgreSQL; cookie HttpOnly, SameSite Strict.
- Tổng quan: thống kê, biểu đồ 6 tháng, yêu cầu gần đây, việc cần xử lý.
- Mỗi phân công mới được cấp vai trò `MEMBER`: tạo mẫu và gửi yêu cầu. Mẫu đề xuất đi qua **nháp → chọn người thẩm định → duyệt dùng chung / trả bổ sung**. Lãnh đạo có quyền ban hành trực tiếp. Lịch sử và các phiên bản chỉ thêm mới.
- Thư viện biểu mẫu; tìm kiếm; tạo mẫu với TEXT, TEXTAREA, NUMBER, DATE, SELECT, CHECKBOX, SECTION.
- Trình thiết kế: thêm, sửa, nhân bản, xóa, kéo sắp xếp và nút lên/xuống; hoàn tác/làm lại; bố cục một hoặc hai cột.
- Xem trước A4; **In / Lưu PDF** bằng hộp thoại in của trình duyệt. Chọn A4, tỷ lệ 100%, tắt header/footer của trình duyệt nếu cần.
- Người thẩm định chọn quy trình một bước mặc định khi lưu mẫu. Vào **Quy trình** để cấu hình nhiều bước, điều kiện AND/OR, song song ALL/ANY, selector người duyệt, mô phỏng, lưu nháp và ban hành phiên bản. Đơn đang chạy giữ version đã chốt.
- Yêu cầu: nháp → gửi → duyệt nhiều bước / từ chối / trả bổ sung; bổ sung giữ mã, snapshot từng vòng, chạy lại từ đầu theo version cũ; hủy nháp/đang chờ/cần bổ sung; lịch sử nhiệm vụ và dữ liệu từng vòng.
- Đơn từ chối được dùng để điền sẵn **đơn mới**; đơn cũ giữ nguyên.
- Hộp phê duyệt; nhận xét bắt buộc khi từ chối; lịch sử chi tiết.
- Thông báo trong ứng dụng cho yêu cầu và kết quả thẩm định mẫu; đánh dấu đã đọc; kiểm tra cập nhật mỗi 30 giây.
- Công ty mẫu có CEO, CDO, hai phòng ban (Sản phẩm, Kinh doanh), mỗi phòng có một team. Trưởng phòng duyệt được đơn từ team trực thuộc. Có thể thêm phòng ban, team, chức danh và nhân sự trong UI.
- Vai trò theo phân công, phạm vi toàn tổ chức/đơn vị, ngày hết hạn và thu hồi.
- Nhật ký chỉ thêm mới, bộ lọc và xuất CSV; danh sách yêu cầu cũng xuất CSV mở được bằng Excel.

Dữ liệu mới lưu trong volume `flowpilot-company_postgres_data`. Volume demo cũ `flowpilot_postgres_data` vẫn được giữ nguyên. Bản gốc Vite/in-memory nằm trong `legacy-vite-memory/`.

## Xem dữ liệu bằng Prisma Studio

Khi PostgreSQL của Compose đang chạy, trong terminal khác:

```powershell
cd C:\Users\xiaomi\Study\Uni\Y4\TLCN\PrjectDemo
.\studio.ps1
```

Mở **http://localhost:5555**. Thầy đã chạy Studio ở cổng này. Bảng thường dùng: `users`, `organizational_units`, `employee_assignments`, `role_assignments`, `form_templates`, `form_review_events`, `workflows`, `workflow_versions`, `workflow_instances`, `workflow_step_runs`, `approval_tasks`, `task_decisions`, `request_submissions`, `requests`. Studio chỉnh sửa trực tiếp dữ liệu, nên dùng UI ứng dụng để kiểm thử quy trình nghiệp vụ. Prisma Client được sinh từ schema ở `backend/prisma/schema.prisma`; API dùng Prisma cho tài khoản và đọc thư viện mẫu, còn các giao dịch nhiều bước dùng SQL có khóa hàng để giữ tính nhất quán. Schema Prisma được đồng bộ với migration SQL; khi introspect cần rà soát quan hệ nhiều phân công và composite unique trước khi generate.

## Demo quy trình nâng cấp

Hai mẫu được seed: **CP-MULTI** (Linh; khoản từ 10 triệu thêm CDO+CEO ALL) và **CP-ANY** (Linh → CDO/CEO ANY). Xem [hướng dẫn sáu chức năng](docs/DEMO.md) và [báo cáo thực hiện](docs/IMPLEMENTATION_REPORT.md).

## Kịch bản demo 5 phút

1. Đăng nhập **Huy** → **Tạo mẫu đơn mới** (hoặc Thư viện biểu mẫu) → thiết kế mẫu → Lưu nháp → Gửi thẩm định → chọn CDO hoặc trưởng phòng.
2. Đăng nhập **CDO** → mở mẫu chờ thẩm định → xem A4 → chọn quản lý trực tiếp hoặc chức danh → **Duyệt và lưu mẫu**. Có thể chỉnh sửa trước khi duyệt hoặc trả lại kèm góp ý. CEO/CDO cũng có thể tạo mẫu và ban hành trực tiếp.
3. Đăng nhập **Huy** → dùng mẫu đã duyệt → điền đơn → gửi. Đơn được giao cho **Linh** nếu quy trình dùng quản lý trực tiếp.
4. Đăng nhập **Linh** → Hộp phê duyệt → xử lý đơn. Huy xem kết quả và lịch sử.
5. Truy cập `/register` để tạo tài khoản mới. Đăng nhập **CEO** → Nhân sự & phân công → phân công → Vai trò & quyền → cấp `REQUESTER` → mở tài khoản. Nhân sự mới đăng nhập được.

## Kiểm thử

Chạy trong Docker, không cần cài Node trên máy:

```powershell
docker compose exec api node tests/run.mjs
```

Hoặc chạy từ source (Node 24, PostgreSQL của Compose đang hoạt động):

```powershell
cd backend
npm ci
npm run build
npm run test:integration
```

Bộ kiểm thử tự tạo **database tạm riêng**, seed dữ liệu, chạy API ở cổng 3099, kiểm tra rồi xóa database tạm. Hiện có 502 kiểm tra có bộ đếm cùng kiểm thử tải 1.000 hồ sơ/20 phiên đồng thời về phân quyền, tổ chức, đăng ký/kích hoạt, thẩm định mẫu, thông báo, workflow và vòng đời yêu cầu. Dữ liệu demo đang sử dụng không bị thay đổi.

## Phát triển cục bộ

```powershell
# Terminal 1, trong PrjectDemo: chờ database sẵn sàng, dừng API/web Docker
.\start.ps1 -DatabaseOnly

# Terminal 2
cd backend
npm ci
npm run dev

# Terminal 3
cd frontend
npm ci
$env:API_URL='http://localhost:3001'
npm run dev
```

Backend dev đọc biến từ shell, rồi `backend/.env`, rồi `.env` của Compose ở gốc dự án; tự dựng kết nối PostgreSQL theo `POSTGRES_*`/`DB_PORT` và dùng `API_PORT` (mặc định 3001). `backend/.env.example` dùng PORT=3001. `start.ps1 -DatabaseOnly` giữ database/volume và dừng các container web/api để server cục bộ dùng cổng.

API dùng `server/`; giao diện dùng App Router trong `app/` và component trong `components/`. Chỉ chạy một backend và một frontend trên các cổng đã chọn. Muốn dùng toàn bộ Docker, Ctrl+C hai server cục bộ rồi chạy `.\start.ps1`.

Nếu gặp `ECONNREFUSED ...:5433`, database chưa nhận kết nối tại cổng đó. Chạy `.\start.ps1 -DatabaseOnly` trước, rồi trong backend dùng `node dev.mjs --check` để kiểm tra kết nối mà không mở thêm server. Kiểm tra `docker compose ps`/`docker compose logs db` nếu database không healthy. `npm run dev` báo hướng dẫn cụ thể khi DB chưa chạy hoặc cổng API đang được dùng; backend thử lại kết nối từ chối trong khoảng 28 giây khi khởi động.

## Cấu hình và vận hành

| Biến | Mặc định | Mục đích |
|---|---|---|
| WEB_PORT | 3000 | Cổng website trên máy |
| API_PORT | 3001 | Cổng API trên máy, chỉ bind 127.0.0.1 |
| DB_PORT | 5433 | Cổng PostgreSQL trên máy |
| APP_ORIGIN | http://localhost:3000 | Origin được phép gửi thao tác; phải khớp URL đang mở |
| POSTGRES_USER / PASSWORD / DB | xem .env.example | Thông tin database |
| SEED_DEMO | true | Seed khi database chưa có tài khoản |
| DEMO_PASSWORD | Demo@2026! | Mật khẩu tài khoản demo lúc seed |
| COOKIE_SECURE | false | Bật true khi triển khai qua HTTPS |

Nếu đổi cổng web, đổi cả `APP_ORIGIN`. Website và API dùng cùng origin qua route proxy của Next. Không mở bằng `127.0.0.1` khi origin đang đặt là `localhost`.

```powershell
docker compose ps
docker compose logs --tail 100 api
docker compose logs --tail 100 web
.\stop.ps1
```

`stop.ps1` dừng container và giữ volume. Không dùng `docker compose down -v` nếu cần giữ dữ liệu.

Sao lưu database bằng PostgreSQL custom format:

```powershell
docker compose exec db pg_dump -U flowpilot -d flowpilot -Fc -f /tmp/flowpilot.dump
docker compose cp db:/tmp/flowpilot.dump ./flowpilot.dump
```

## Tài liệu

- [Kế hoạch phát triển: các bước, sáu chức năng ưu tiên và tiêu chí nghiệm thu](docs/DEVELOPMENT_PLAN.md)
- [Kiến trúc, mô hình và quy tắc nghiệp vụ](docs/ARCHITECTURE.md)
- [SRS](docs/SRS.md)
- [Thiết kế bộ xử lý và class diagram](docs/WORKFLOW_DESIGN.md)
- [Báo cáo triển khai theo từng mốc](docs/IMPLEMENTATION_REPORT.md)
- [API](docs/API.md)
- [Thiết kế UI/UX và hướng dẫn kiểm tra](docs/UI-UX.md)
- [Kết quả kiểm thử](docs/TESTING.md)

Phạm vi là website demo hoàn chỉnh theo mô hình một doanh nghiệp trong cuộc trò chuyện **“Xây dựng SRS và MVP demo”**. Chưa triển khai SSO, email/SMS, chữ ký số pháp lý, multi-tenant, lịch SLA theo ngày làm việc, antivirus hoặc BPMN tổng quát. PDF là bản in tài liệu; tên người duyệt trên bản in không thay cho chữ ký số. Trước khi dùng dữ liệu doanh nghiệp thật cần cấu hình HTTPS, secrets, backup và vận hành phù hợp.


## Vận hành quy trình mở rộng

SLA/nhắc hạn/chuyển cấp nằm trong cấu hình từng bước. Menu **Ủy quyền phê duyệt** tạo lịch thay người; chi tiết request có tài liệu/version/trao đổi/chuyển giao; **Thời hạn & điểm chậm** xem báo cáo có scope. Mô phỏng có xét lịch ủy quyền đang hiệu lực.

- [Cách hoạt động cả 12 chức năng](docs/WORKFLOW_GUIDE.md)
- [Kế hoạch và quy trình phát triển, gồm CR-02 và phần giải thích từng chức năng](docs/DEVELOPMENT_PLAN.md)
- [Kiểm thử và giới hạn kiểm chứng](docs/TESTING.md)

Migration hiện tại 001–006. Tài liệu lưu bytea trong PostgreSQL, cùng backup/volume DB; worker tự kiểm tra mỗi 30 giây, có thể tắt SLA_WORKER=false. Đã chạy 502 kiểm tra chức năng có bộ đếm và tải 1.000 hồ sơ/20 phiên; xem số đo actual và phạm vi UAT trong tài liệu.


## Demo trình bày trọng tâm workflow

CEO → Quy trình phê duyệt → **MS-BV-01 — Đề nghị mua sắm — quy trình trình bày**. Chính sách minh họa: dưới 5 triệu do quản lý xác nhận; 5–<20 triệu thêm thẩm định chi phí; từ 20 triệu cần CDO + reviewer đồng thẩm định ALL rồi CEO. Xử lý khẩn hoặc chi ngoài kế hoạch cũng cần CEO. Có SLA, mô phỏng, version và hồ sơ bổ sung.

[Kịch bản 8–10 phút, sơ đồ, hồ sơ đã chuẩn bị và tên đề tài đề xuất](docs/DEFENSE_DEMO.md). Script chuẩn bị riêng: `backend/scripts/prepare-defense-demo.mjs`; không tự ghi đè workflow đã chỉnh riêng, không được đưa vào seed mặc định để giữ nguyên chính sách mẫu cũ. Quyền role reviewer liên phòng ban và giới hạn hiện có được ghi rõ trong kịch bản.


## Cấu hình workflow bằng flow

Mở một quy trình → **Sơ đồ flow**: chọn node, cấu hình bên phải, chạy mô phỏng và lưu/ban hành. Có nhánh điều kiện Đúng/Sai, nhóm song song ALL/ANY, pan/zoom/minimap/toàn màn hình, thêm bước và undo/redo. **Danh sách bước** dùng chung dữ liệu. Xem [hướng dẫn canvas](docs/WORKFLOW_CANVAS.md). Kéo node là bố trí, đổi thứ tự trong panel là thay nghiệp vụ. Test frontend riêng: `npm run test:workflow-graph` (103 checks), không tính chung vào bộ backend 502.
