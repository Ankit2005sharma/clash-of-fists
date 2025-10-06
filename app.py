import os
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from flask_socketio import SocketIO, join_room, leave_room, emit, disconnect

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_secret_key')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///clash_of_fists.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# User model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    online = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# AI Game state stored per user in memory (for demo)
ai_game_states = {}

def ai_computer_choice():
    import random
    return random.choice(['rock', 'paper', 'scissors'])

def determine_winner(choice1, choice2):
    if choice1 == choice2:
        return 'tie'
    wins = {
        'rock': 'scissors',
        'scissors': 'paper',
        'paper': 'rock'
    }
    if wins.get(choice1) == choice2:
        return 'win'
    else:
        return 'lose'

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('mode_selection'))
    return redirect(url_for('login'))

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('mode_selection'))
    if request.method == 'POST':
        email = request.form['email']
        username = request.form['username']
        password = request.form['password']
        if User.query.filter((User .email == email) | (User .username == username)).first():
            flash('Email or username already exists', 'danger')
            return redirect(url_for('signup'))
        user = User(email=email, username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash('Account created! Please log in.', 'success')
        return redirect(url_for('login'))
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('mode_selection'))
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            user.online = True
            db.session.commit()
            return redirect(url_for('mode_selection'))
        flash('Invalid username or password', 'danger')
        return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    current_user.online = False
    db.session.commit()
    logout_user()
    flash('Logged out successfully', 'info')
    return redirect(url_for('login'))

@app.route('/mode')
@login_required
def mode_selection():
    return render_template('mode.html')

@app.route('/lobby')
@login_required
def lobby():
    online_users = User.query.filter(User.online == True, User.id != current_user.id).all()
    return render_template('lobby.html', online_users=online_users)

@app.route('/game-ai')
@login_required
def game_ai():
    # Initialize AI game state for user if not exists
    if current_user.username not in ai_game_states:
        ai_game_states[current_user.username] = {
            'player_score': 0,
            'computer_score': 0,
            'round': 0,
            'history': []
        }
    return render_template('game_ai.html')

@app.route('/game')
@login_required
def game():
    return render_template('game.html')

# AI game play route
@app.route('/play', methods=['POST'])
@login_required
def play():
    data = request.get_json()
    player_choice = data.get('choice')
    if player_choice not in ['rock', 'paper', 'scissors']:
        return jsonify({'error': 'Invalid choice'}), 400

    state = ai_game_states.setdefault(current_user.username, {
        'player_score': 0,
        'computer_score': 0,
        'round': 0,
        'history': []
    })

    computer_choice = ai_computer_choice()
    result = determine_winner(player_choice, computer_choice)

    state['round'] += 1
    if result == 'win':
        state['player_score'] += 1
    elif result == 'lose':
        state['computer_score'] += 1

    # Emoji mapping
    emoji_map = {'rock': '🪨', 'paper': '📃', 'scissors': '✂️'}

    # Update history
    state['history'].append({
        'round': state['round'],
        'player_choice': player_choice,
        'computer_choice': computer_choice,
        'result': result
    })

    response = {
        'player_score': state['player_score'],
        'computer_score': state['computer_score'],
        'round': state['round'],
        'player_choice': player_choice,
        'computer_choice': computer_choice,
        'player_emoji': emoji_map[player_choice],
        'computer_emoji': emoji_map[computer_choice],
        'result': result,
        'history': state['history']
    }
    return jsonify(response)

# AI game reset route
@app.route('/reset', methods=['POST'])
@login_required
def reset():
    ai_game_states[current_user.username] = {
        'player_score': 0,
        'computer_score': 0,
        'round': 0,
        'history': []
    }
    state = ai_game_states[current_user.username]
    response = {
        'player_score': 0,
        'computer_score': 0,
        'round': 0,
        'player_choice': '-',
        'computer_choice': '-',
        'player_emoji': '',
        'computer_emoji': '',
        'result': '',
        'history': []
    }
    return jsonify(response)

# --- SocketIO multiplayer events remain unchanged ---
# (Keep your existing SocketIO code here)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
