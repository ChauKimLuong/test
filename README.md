# FlowPilot — Website phê duyệt nội bộ

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
- Người thẩm định hoặc người ban hành chọn người duyệt khi lưu mẫu: quản lý trực tiếp hoặc người giữ chức danh. Sau đó có thể đổi workflow cho đơn tương lai; lịch sử thay đổi được lưu.
- Yêu cầu: nháp → gửi → phê duyệt / từ chối; hủy nháp hoặc đơn đang chờ; bộ lọc và phân trang.
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

Mở **http://localhost:5555**. Thầy đã chạy Studio ở cổng này. Bảng thường dùng: `users`, `organizational_units`, `employee_assignments`, `role_assignments`, `form_templates`, `form_review_events`, `workflows`, `requests`. Studio chỉnh sửa trực tiếp dữ liệu, nên dùng UI ứng dụng để kiểm thử quy trình nghiệp vụ. Prisma Client được sinh từ schema ở `backend/prisma/schema.prisma`; API dùng Prisma cho tài khoản và đọc thư viện mẫu, còn các giao dịch nhiều bước dùng SQL có khóa hàng để giữ tính nhất quán. Sau khi đổi schema SQL, chạy `npx prisma db pull` và `npm run prisma:generate`.

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

Bộ kiểm thử tự tạo **database tạm riêng**, seed dữ liệu, chạy API ở cổng 3099, kiểm tra rồi xóa database tạm. Hiện có 100 kiểm tra tích hợp về phân quyền, tổ chức, đăng ký/kích hoạt, thẩm định mẫu, thông báo, workflow và vòng đời yêu cầu. Dữ liệu demo đang sử dụng không bị thay đổi.

## Phát triển cục bộ

```powershell
# Terminal 1, trong PrjectDemo
docker compose up -d db

# Terminal 2
cd backend
npm ci
$env:DATABASE_URL='postgres://flowpilot:flowpilot_local_change_me@localhost:5433/flowpilot'
$env:APP_ORIGIN='http://localhost:3000'
$env:DEMO_PASSWORD='Demo@2026!'
npm run dev

# Terminal 3
cd frontend
npm ci
$env:API_URL='http://localhost:3001'
npm run dev
```

Nếu các container web/api đang chiếm cổng, dừng chúng trước khi chạy hai server cục bộ: `docker compose stop web api`. API dùng `server/`; giao diện dùng App Router trong `app/` và component trong `components/`.

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

- [Kiến trúc, mô hình và quy tắc nghiệp vụ](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Thiết kế UI/UX và hướng dẫn kiểm tra](docs/UI-UX.md)
- [Kết quả kiểm thử](docs/TESTING.md)

Phạm vi là website demo hoàn chỉnh theo mô hình một doanh nghiệp trong cuộc trò chuyện **“Xây dựng SRS và MVP demo”**. Chưa triển khai SSO, email/SMS, chữ ký số pháp lý, tệp đính kèm, multi-tenant hoặc nhiều cấp duyệt. PDF là bản in tài liệu; tên người duyệt trên bản in không thay cho chữ ký số. Trước khi dùng dữ liệu doanh nghiệp thật cần cấu hình HTTPS, secrets, backup và vận hành phù hợp.
