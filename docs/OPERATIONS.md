# Chạy, nâng cấp và phục hồi

## Khởi động

Trong PrjectDemo chạy `start.ps1` (Windows + Docker Desktop/Linux containers); hoặc `docker compose up -d --build --wait` khi Docker ở PATH. Mở localhost:3000; PostgreSQL host 5433; API 3001; Studio chạy riêng bằng `studio.ps1`, port 5555.

Clone sạch cần `.env` từ `.env.example`; start.ps1 tạo khi chưa có. Volume của mỗi máy là riêng; compose/seed/migration tạo schema và dữ liệu mẫu tự động. Không cần dựng bảng thủ công. Không mang volume giữa máy bằng Git.

## Nâng cấp

1. Ghi commit/image hiện tại; sao lưu DB trước migration.
2. Build api/web; lên container với `--wait`; migration transaction/advisory lock tự chạy.
3. Kiểm tra `docker compose ps`, health, đăng nhập, inbox và một hồ sơ cũ.
4. Chạy `docker compose exec api node tests/run.mjs` trên DB tạm; không reset DB demo.

## Sao lưu

```powershell
docker compose exec -T db pg_dump -U flowpilot -d flowpilot -Fc -f /tmp/flowpilot.dump
docker compose cp db:/tmp/flowpilot.dump ./flowpilot.dump
```

Đổi user/database theo .env của máy. Backup chứa dữ liệu tài khoản; được Git ignore. Backup thực tế trước đợt này ở `backups/pre-workflow-engine-20261001-091108.dump`.

## Restore thử

```powershell
docker compose cp ./flowpilot.dump db:/tmp/restore.dump
docker compose exec -T db createdb -U flowpilot flowpilot_restore_check
docker compose exec -T db pg_restore -U flowpilot -d flowpilot_restore_check /tmp/restore.dump
docker compose exec -T db psql -U flowpilot -d flowpilot_restore_check -c "SELECT count(*) FROM requests;"
```

Đối chiếu mã/nội dung/history bằng query checksum và số lượng trước khi chuyển ứng dụng sang DB phục hồi. DB restore_check là DB thử, không ghi đè DB chính. Xóa DB thử bằng dropdb chỉ khi đã kiểm chứng và xác nhận đúng tên.

Sau khi có dữ liệu nhiều bước/RETURNED, code baseline không phải rollback an toàn trên schema mới. Khi nâng cấp hỏng: dừng mutation, giữ DB lỗi để phân tích, restore vào DB riêng, chạy image khớp backup rồi chuyển connection sau đối chiếu; xử lý dữ liệu phát sinh sau backup riêng.

## Trường hợp bị chặn

BLOCKED giữ Request PENDING và nguyên nhân tại instance. Khôi phục assignment/role hợp lệ theo version đã chốt; người có WORKFLOW_OPERATE dùng **Thử lại sau khi khắc phục**. Không có chức năng tự chọn người khác hoặc tự duyệt thay. Người gửi có thể hủy và tạo hồ sơ mới khi cần đổi quy trình.

`stop.ps1` giữ volume. Không dùng `docker compose down -v` với dữ liệu muốn giữ. Log lỗi có X-Request-Id để đối chiếu; Studio dùng xem dữ liệu, nghiệp vụ xử lý bằng UI/API.


## Worker thời hạn và dữ liệu tài liệu

API tự áp migration 006 dưới advisory lock, cùng transaction migration nền. Worker kiểm tra mỗi 30 giây sau khởi động. SLA_WORKER=false tắt worker; test dùng tùy chọn này và gọi operations/sla/run có quyền. Deadline/lịch lưu DB nên restart không mất lịch; không cam kết thông báo chính xác từng giây. Chỉ một batch 200 hồ sơ/lần; lỗi chuyển cấp được ghi và người vận hành chuyển giao thủ công.

Tài liệu nằm trong request_attachments.content bytea, cùng postgres_data. pg_dump/pg_restore bao gồm file và join snapshot; không cần upload volume. Không sửa bytea/hash/version hoặc lịch sử bằng Studio. Archive qua UI khi DRAFT/RETURNED. Giới hạn cố định phù hợp demo; muốn file lớn cần thiết kế object storage và antivirus ở đợt sau.

Bản nâng cấp cần code/schema 006; không chạy code baseline vào DB mới. Backup trước 006 được ghi trong báo cáo triển khai. Xem WORKFLOW_GUIDE.md để xử lý delegation thất bại/chuyển cấp lỗi và đọc mẫu số báo cáo.


## Sửa lỗi khởi động 04/10/2026 — ECONNREFUSED 5433

Log Mapped route chỉ cho biết Nest đăng ký endpoint; ứng dụng chưa listen nếu Database.onModuleInit chưa kết nối được. ECONNREFUSED ở cả ::1/127.0.0.1:5433 nghĩa là PostgreSQL chưa nhận kết nối tại cổng host đó lúc backend khởi động.

Chế độ phát triển: từ PrjectDemo chạy `.\start.ps1 -DatabaseOnly`; script đợi Docker Engine (tối đa 120 giây), dừng API/web Docker và chờ db healthy, giữ volume. Backend/frontend tiếp tục chạy bằng npm run dev trong hai terminal riêng. Backend dev đọc shell > backend/.env > root .env, dựng DATABASE_URL bằng POSTGRES_* và DB_PORT, dùng API_PORT=3001. PORT trong backend/.env.example đã sửa thành 3001.

`node dev.mjs --check` chỉ kiểm tra DB, không mở server. Dev báo hướng dẫn và exit 1 nếu DB không kết nối; chặn mở API thứ hai trên cổng đang dùng. Database.onModuleInit thử lại ECONNREFUSED 15 lần, nghỉ 2 giây giữa các lần, rồi báo địa chỉ và lệnh phục hồi; không log mật khẩu. Để dùng toàn Docker, Ctrl+C server cục bộ rồi `.\start.ps1`.

Kiểm chứng: DatabaseOnly đã chạy; db healthy, API/web container dừng; backend build đạt; preflight DB thật exit 0, DB thử không listening exit 1 với hướng dẫn; frontend login/API health cục bộ HTTP 200. Không dừng Docker daemon hoặc dịch vụ các dự án khác.
