from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os

app = Flask(__name__, static_folder='.')
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///library.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ─── Models ─────────────────────────────────────────────────────────────
class Book(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    title      = db.Column(db.String(200), nullable=False)
    author     = db.Column(db.String(150), nullable=False)
    isbn       = db.Column(db.String(20), unique=True, nullable=False)
    genre      = db.Column(db.String(80))
    total_qty  = db.Column(db.Integer, default=1)
    avail_qty  = db.Column(db.Integer, default=1)
    cover_url  = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    transactions = db.relationship('Transaction', backref='book', lazy=True)

class Member(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(150), nullable=False)
    email      = db.Column(db.String(150), unique=True, nullable=False)
    card_no    = db.Column(db.String(20), unique=True, nullable=False)
    role       = db.Column(db.String(20), default='member')   # member | librarian | admin
    joined_at  = db.Column(db.DateTime, default=datetime.utcnow)
    transactions = db.relationship('Transaction', backref='member', lazy=True)

class Transaction(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    book_id     = db.Column(db.Integer, db.ForeignKey('book.id'), nullable=False)
    member_id   = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    issued_at   = db.Column(db.DateTime, default=datetime.utcnow)
    due_date    = db.Column(db.DateTime)
    returned_at = db.Column(db.DateTime, nullable=True)
    fine        = db.Column(db.Float, default=0.0)
    status      = db.Column(db.String(20), default='issued')  # issued | returned | overdue

# ─── Seed demo data ──────────────────────────────────────────────────────
def seed():
    if Book.query.count() == 0:
        books = [
            Book(title="The Great Gatsby",     author="F. Scott Fitzgerald", isbn="9780743273565", genre="Fiction",    total_qty=3, avail_qty=2),
            Book(title="To Kill a Mockingbird",author="Harper Lee",           isbn="9780061935466", genre="Fiction",    total_qty=2, avail_qty=1),
            Book(title="1984",                 author="George Orwell",        isbn="9780451524935", genre="Dystopian",  total_qty=4, avail_qty=4),
            Book(title="Clean Code",           author="Robert C. Martin",     isbn="9780132350884", genre="Technology", total_qty=2, avail_qty=2),
            Book(title="Dune",                 author="Frank Herbert",        isbn="9780441013593", genre="Sci-Fi",     total_qty=3, avail_qty=3),
            Book(title="Sapiens",              author="Yuval Noah Harari",    isbn="9780062316097", genre="History",    total_qty=2, avail_qty=0),
        ]
        db.session.bulk_save_objects(books)
    if Member.query.count() == 0:
        members = [
            Member(name="Admin User",   email="admin@lib.com",   card_no="LIB001", role="admin"),
            Member(name="Alice Johnson",email="alice@lib.com",   card_no="LIB002", role="librarian"),
            Member(name="Bob Smith",    email="bob@lib.com",     card_no="LIB003", role="member"),
            Member(name="Carol White",  email="carol@lib.com",   card_no="LIB004", role="member"),
        ]
        db.session.bulk_save_objects(members)
        db.session.flush()
        # demo transaction
        b = Book.query.filter_by(isbn="9780062316097").first()
        m = Member.query.filter_by(card_no="LIB003").first()
        if b and m:
            t = Transaction(book_id=b.id, member_id=m.id,
                            due_date=datetime.utcnow() - timedelta(days=3),
                            status='overdue', fine=3.0)
            db.session.add(t)
    db.session.commit()

# ─── Helper ──────────────────────────────────────────────────────────────
def compute_fine(due: datetime, returned: datetime = None) -> float:
    end = returned or datetime.utcnow()
    delta = (end - due).days
    return max(0, delta) * 1.0   # ₹1 / day

# ─── Routes: Books ───────────────────────────────────────────────────────
@app.route('/api/books', methods=['GET'])
def list_books():
    q      = request.args.get('q', '')
    genre  = request.args.get('genre', '')
    query  = Book.query
    if q:     query = query.filter(db.or_(Book.title.ilike(f'%{q}%'), Book.author.ilike(f'%{q}%'), Book.isbn.ilike(f'%{q}%')))
    if genre: query = query.filter(Book.genre == genre)
    books = query.order_by(Book.title).all()
    return jsonify([{
        'id': b.id, 'title': b.title, 'author': b.author,
        'isbn': b.isbn, 'genre': b.genre,
        'total_qty': b.total_qty, 'avail_qty': b.avail_qty,
        'cover_url': b.cover_url or ''
    } for b in books])

@app.route('/api/books', methods=['POST'])
def add_book():
    d = request.json
    if Book.query.filter_by(isbn=d['isbn']).first():
        return jsonify({'error': 'ISBN already exists'}), 400
    b = Book(title=d['title'], author=d['author'], isbn=d['isbn'],
             genre=d.get('genre',''), total_qty=d.get('total_qty',1),
             avail_qty=d.get('total_qty',1), cover_url=d.get('cover_url',''))
    db.session.add(b); db.session.commit()
    return jsonify({'id': b.id, 'message': 'Book added'}), 201

@app.route('/api/books/<int:bid>', methods=['PUT'])
def update_book(bid):
    b = Book.query.get_or_404(bid)
    d = request.json
    for f in ['title','author','genre','cover_url']:
        if f in d: setattr(b, f, d[f])
    if 'total_qty' in d:
        diff = d['total_qty'] - b.total_qty
        b.total_qty = d['total_qty']
        b.avail_qty = max(0, b.avail_qty + diff)
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/books/<int:bid>', methods=['DELETE'])
def delete_book(bid):
    b = Book.query.get_or_404(bid)
    db.session.delete(b); db.session.commit()
    return jsonify({'message': 'Deleted'})

# ─── Routes: Members ─────────────────────────────────────────────────────
@app.route('/api/members', methods=['GET'])
def list_members():
    members = Member.query.order_by(Member.name).all()
    return jsonify([{
        'id': m.id, 'name': m.name, 'email': m.email,
        'card_no': m.card_no, 'role': m.role,
        'joined_at': m.joined_at.isoformat()
    } for m in members])

@app.route('/api/members', methods=['POST'])
def add_member():
    d = request.json
    if Member.query.filter_by(email=d['email']).first():
        return jsonify({'error': 'Email already registered'}), 400
    # auto card_no
    last = Member.query.order_by(Member.id.desc()).first()
    num  = (last.id + 1) if last else 1
    card = f"LIB{num:04d}"
    m = Member(name=d['name'], email=d['email'], card_no=card,
               role=d.get('role','member'))
    db.session.add(m); db.session.commit()
    return jsonify({'id': m.id, 'card_no': card, 'message': 'Member added'}), 201

@app.route('/api/members/<int:mid>', methods=['DELETE'])
def delete_member(mid):
    m = Member.query.get_or_404(mid)
    db.session.delete(m); db.session.commit()
    return jsonify({'message': 'Deleted'})

# ─── Routes: Transactions ────────────────────────────────────────────────
@app.route('/api/transactions', methods=['GET'])
def list_transactions():
    txns = Transaction.query.order_by(Transaction.issued_at.desc()).limit(100).all()
    return jsonify([_txn_dict(t) for t in txns])

@app.route('/api/transactions/issue', methods=['POST'])
def issue_book():
    d = request.json
    b = Book.query.get_or_404(d['book_id'])
    if b.avail_qty < 1:
        return jsonify({'error': 'No copies available'}), 400
    due = datetime.utcnow() + timedelta(days=d.get('days', 14))
    t   = Transaction(book_id=b.id, member_id=d['member_id'], due_date=due)
    b.avail_qty -= 1
    db.session.add(t); db.session.commit()
    return jsonify({'id': t.id, 'due_date': due.isoformat(), 'message': 'Book issued'}), 201

@app.route('/api/transactions/<int:tid>/return', methods=['POST'])
def return_book(tid):
    t = Transaction.query.get_or_404(tid)
    if t.returned_at:
        return jsonify({'error': 'Already returned'}), 400
    now  = datetime.utcnow()
    fine = compute_fine(t.due_date, now)
    t.returned_at = now
    t.fine        = fine
    t.status      = 'returned'
    t.book.avail_qty += 1
    db.session.commit()
    return jsonify({'fine': fine, 'message': 'Returned', 'returned_at': now.isoformat()})

def _txn_dict(t):
    overdue = not t.returned_at and datetime.utcnow() > t.due_date
    return {
        'id': t.id,
        'book_title': t.book.title,
        'book_id': t.book_id,
        'member_name': t.member.name,
        'member_id': t.member_id,
        'issued_at': t.issued_at.isoformat(),
        'due_date': t.due_date.isoformat(),
        'returned_at': t.returned_at.isoformat() if t.returned_at else None,
        'fine': compute_fine(t.due_date) if overdue else t.fine,
        'status': 'overdue' if overdue else t.status
    }

# ─── Routes: Dashboard stats ─────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def stats():
    total_books   = Book.query.count()
    total_members = Member.query.count()
    active_loans  = Transaction.query.filter_by(returned_at=None).count()
    overdue       = Transaction.query.filter(
        Transaction.returned_at == None,
        Transaction.due_date < datetime.utcnow()
    ).count()
    return jsonify({
        'total_books': total_books,
        'total_members': total_members,
        'active_loans': active_loans,
        'overdue': overdue
    })

@app.route('/api/genres', methods=['GET'])
def genres():
    rows = db.session.query(Book.genre).distinct().all()
    return jsonify([r[0] for r in rows if r[0]])

# Serve frontend
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed()
    app.run(debug=True, port=5000)
