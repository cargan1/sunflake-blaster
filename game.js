async function signInAnonymously() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.signUp({
            email: `anonymous_${Date.now()}@example.com`,
            password: `anon${Date.now()}`
        });
        
        if (error) {
            console.error('Sign in error:', error);
            return;
        }
        
        console.log('Anonymous session created:', session);
    } catch (error) {
        console.error('Error in anonymous sign in:', error);
    }
}

// Call this when the game starts
window.onload = function() {
    signInAnonymously();
};

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let cursors;
let bullets;
let canShoot = true;
let spacebarPressed = false;
const bulletSpeed = 400;
const playerSpeed = 300;
const playerDrag = 800;
const TARGET_DISTANCE = 5;
const LERP_FACTOR = 0.05;
let stars1;  // Fast stars (closest)
let stars2;  // Medium speed stars
let stars3;  // Slow stars (furthest)
let enemies;
let enemyBullets;
const ENEMY_SPEED = -100;
const ENEMY_BULLET_SPEED = -250;
let lastEnemySpawnTime = 0;
let enemySpawnInterval = 3000;  // Start with 3 seconds between spawns
const MIN_SPAWN_INTERVAL = 800; // Minimum 1 second between spawns
let spawnIntervalDecrease = 200; // Decrease spawn time by 100ms every spawn
let gameStartTime;
let score = 0;
let scoreText;
let gameOver = false;
let lives = 3;
let deflectors = 3;
let isInvulnerable = false;
let lifeIndicators = [];
let deflectorIndicators = [];
let boss = null;
let bossHealth = 0;
let bossMaxHealth = 0;
let bossNumber = 0;
let bossHealthBar = null;
let bossNameText = null;
let bossMovingUp = true;
const BOSS_SPEED = 100;
const BOSS_BULLET_SPEED = 300;
const INITIAL_BOSS_HEALTH = 10;
const BOSS_SHOOT_INTERVAL = 1000;
let lastBossShotTime = 0;
let bossKey;

function preload() {
    this.load.image('player', 'assets/player.png');
    this.load.image('bullet', 'assets/bullet.png');
    this.load.image('enemy', 'assets/enemies.png');
    this.load.image('boss', 'assets/boss.png');
    
    // Add sound loading
    this.load.audio('shoot', 'assets/sounds/bullet.wav');
    
    // Create star texture
    const graphics = this.add.graphics();
    graphics.fillStyle(0xFFFFFF);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('star1', 8, 8);
    graphics.destroy();
}

function create() {
    // Set background color
    this.cameras.main.setBackgroundColor('#000000');

    // Create particle emitters for stars
    stars1 = this.add.particles('star1').createEmitter({
        x: config.width + 10,
        y: { min: 0, max: config.height },
        quantity: 2,
        frequency: 50,
        speedX: { min: -300, max: -400 },
        speedY: 0,
        lifespan: 5000,
        scale: { min: 0.4, max: 0.6 },
        alpha: { min: 0.4, max: 0.6 },
        blendMode: 'ADD'
    });

    stars2 = this.add.particles('star1').createEmitter({
        x: config.width + 10,
        y: { min: 0, max: config.height },
        quantity: 2,
        frequency: 80,
        speedX: { min: -150, max: -200 },
        speedY: 0,
        lifespan: 8000,
        scale: { min: 0.3, max: 0.4 },
        alpha: { min: 0.3, max: 0.4 },
        blendMode: 'ADD'
    });

    stars3 = this.add.particles('star1').createEmitter({
        x: config.width + 10,
        y: { min: 0, max: config.height },
        quantity: 2,
        frequency: 100,
        speedX: { min: -50, max: -100 },
        speedY: 0,
        lifespan: 10000,
        scale: { min: 0.1, max: 0.2 },
        alpha: { min: 0.1, max: 0.2 },
        blendMode: 'ADD'
    });

    // Create player sprite - make sure it's on top of particles
    player = this.physics.add.sprite(100, this.sys.game.config.height / 2, 'player');
    player.setCollideWorldBounds(true);
    player.setDepth(1);  // This ensures player is drawn above particles
    // Adjust player hit box - make it 70% of original size
    const playerWidth = player.width * 0.7;
    const playerHeight = player.height * 0.7;
    player.body.setSize(playerWidth, playerHeight);
    player.body.setOffset(
        (player.width - playerWidth) / 2, 
        (player.height - playerHeight) / 2
    );

    // Update bullet group to use new bullet image
    bullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 30
    });

    // Set up keyboard controls
    cursors = this.input.keyboard.createCursorKeys();
    spacebar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Add after existing bullet group
    enemies = this.physics.add.group();
    enemyBullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 30
    });

    gameStartTime = this.time.now;

    // Separate collision systems completely
    setupEnemyCollisions.call(this);
    setupPlayerCollisions.call(this);

    // Add score display after other creation code
    const scoreBox = this.add.graphics();
    scoreBox.lineStyle(2, 0x00ff00);
    scoreBox.fillStyle(0x00ff00, 0.2);
    scoreBox.strokeRect(20, config.height - 90, 200, 70);
    scoreBox.fillRect(20, config.height - 90, 200, 70);
    
    scoreText = this.add.text(30, config.height - 80, 'Score: 0', { 
        fontFamily: 'Arial', 
        fontSize: '24px', 
        color: '#00ff00' 
    });
    scoreText.setDepth(2);

    // Create life indicators (red bars)
    for (let i = 0; i < 3; i++) {
        const lifeBar = this.add.rectangle(45 + (i * 25), config.height - 40, 20, 8, 0xff0000);
        lifeBar.setDepth(2);
        lifeIndicators.push(lifeBar);
    }

    // Create deflector indicators (blue bars)
    for (let i = 0; i < 3; i++) {
        const deflectorBar = this.add.rectangle(130 + (i * 25), config.height - 40, 20, 8, 0x0088ff);
        deflectorBar.setDepth(2);
        deflectorIndicators.push(deflectorBar);
    }

    // Add this after other key bindings
    bossKey = this.input.keyboard.addKey('B');

    // Add after other initialization code but before player creation
    this.bulletSound = this.sound.add('shoot', { 
        volume: 0.3,
        loop: false 
    });
}

function update(time) {
    // Add this at the start of update
    if (gameOver) {
        return;  // Stop updating if game is over
    }

    // Add boss key check
    if (bossKey.isDown && !boss) {
        spawnBoss.call(this);
    }

    // Calculate target velocity based on input
    let targetVelocityX = 0;
    let targetVelocityY = 0;

    if (cursors.left.isDown) {
        targetVelocityX = -playerSpeed;
    } else if (cursors.right.isDown) {
        targetVelocityX = playerSpeed;
    }

    if (cursors.up.isDown) {
        targetVelocityY = -playerSpeed;
    } else if (cursors.down.isDown) {
        targetVelocityY = playerSpeed;
    }

    // Lerp the current velocity towards the target velocity
    const currentVelocityX = player.body.velocity.x;
    const currentVelocityY = player.body.velocity.y;

    const newVelocityX = currentVelocityX + (targetVelocityX - currentVelocityX) * LERP_FACTOR;
    const newVelocityY = currentVelocityY + (targetVelocityY - currentVelocityY) * LERP_FACTOR;

    player.setVelocity(newVelocityX, newVelocityY);

    // Update shooting logic
    if (spacebar.isDown) {
        if (canShoot && !spacebarPressed) {
            const bullet = bullets.create(player.x + 50, player.y, 'bullet');
            if (bullet) {
                bullet.setVelocityX(bulletSpeed);
                this.bulletSound.play();  // Play sound when bullet is created
            }
            spacebarPressed = true;
            canShoot = false;
        }
    } else {
        spacebarPressed = false;
        canShoot = true;
    }

    // New bullet cleanup
    bullets.children.iterate((bullet) => {
        if (bullet && bullet.x > config.width) {
            bullet.destroy();
        }
    });

    // Enemy spawning logic
    if (time > lastEnemySpawnTime + enemySpawnInterval) {
        spawnEnemy.call(this);
        lastEnemySpawnTime = time;
        
        // Decrease spawn interval but don't go below minimum
        enemySpawnInterval = Math.max(
            MIN_SPAWN_INTERVAL, 
            enemySpawnInterval - spawnIntervalDecrease
        );
    }

    // Enemy shooting logic
    enemies.children.iterate((enemy) => {
        if (enemy && enemy.active) {
            // Random shooting
            if (Phaser.Math.Between(1, 150) === 1) {  // Adjust probability as needed
                const bullet = enemyBullets.create(enemy.x - 20, enemy.y, 'bullet');
                if (bullet) {
                    bullet.setVelocityX(ENEMY_BULLET_SPEED);
                }
            }
        }
    });

    // Cleanup enemy bullets
    enemyBullets.children.iterate((bullet) => {
        if (bullet && bullet.x < 0) {
            bullet.destroy();
        }
    });

    // Add after score updates in hitEnemy
    checkBossSpawn.call(this);

    // Add boss movement and shooting
    if (boss && boss.body) {
        // Vertical movement
        if (bossMovingUp) {
            boss.body.setVelocityY(-BOSS_SPEED);
            if (boss.y <= 100) bossMovingUp = false;
        } else {
            boss.body.setVelocityY(BOSS_SPEED);
            if (boss.y >= config.height - 100) bossMovingUp = true;
        }

        // Boss shooting
        if (time > lastBossShotTime + BOSS_SHOOT_INTERVAL) {
            shootBossBullet.call(this);
            lastBossShotTime = time;
        }

        // Update health bar
        updateBossHealthBar.call(this);
    }
}

// Add these new functions
function spawnEnemy() {
    const enemy = enemies.create(
        config.width + 20,
        Phaser.Math.Between(50, config.height - 50),
        'enemy'
    );
    
    if (enemy) {
        enemy.setVelocityX(ENEMY_SPEED);
        enemy.setDepth(1);
        
        // Adjust enemy hit box - make it 60% of original size
        const enemyWidth = enemy.width * 0.6;
        const enemyHeight = enemy.height * 0.6;
        enemy.body.setSize(enemyWidth, enemyHeight);
        enemy.body.setOffset(
            (enemy.width - enemyWidth) / 2,
            (enemy.height - enemyHeight) / 2
        );
        
        enemy.checkWorldBounds = true;
        enemy.outOfBoundsKill = true;
    }
}

// New function to setup enemy-related collisions
function setupEnemyCollisions() {
    this.physics.add.overlap(
        bullets,
        enemies,
        (bullet, enemy) => {
            // Make absolutely sure this isn't the boss
            if (enemy !== boss && !enemy.getData('isBoss')) {
                bullet.destroy();
                enemy.destroy();
                score += 100;
                scoreText.setText('Score: ' + score);
                checkBossSpawn.call(this);
            }
        },
        null,
        this
    );
}

// New function to setup player-related collisions
function setupPlayerCollisions() {
    // Player collision with enemies
    this.physics.add.overlap(
        player,
        enemies,
        handlePlayerHit,
        null,
        this
    );

    // Player collision with enemy bullets
    this.physics.add.overlap(
        player,
        enemyBullets,
        handlePlayerHit,
        null,
        this
    );
}

// Completely separate boss collision system
function setupBossCollisions() {
    if (boss) {
        // Boss collision with player bullets
        this.physics.add.overlap(
            bullets,
            boss,
            handleBossHit,
            null,
            this
        );

        // Boss collision with player
        this.physics.add.overlap(
            player,
            boss,
            handlePlayerHit,
            null,
            this
        );
    }
}

// Separate handler for boss hits
function handleBossHit(bullet, bossSprite) {
    // Create permanent hit indicator at bullet position
    this.add.rectangle(
        bullet.x,
        bullet.y,
        10,
        10,
        0x00ff00,
        0.8
    ).setDepth(2);

    bullet.destroy();
    bossHealth--;
    
    if (bossHealth <= 0) {
        score += 1000;
        scoreText.setText('Score: ' + score);
        bossHealth = bossMaxHealth;
    }
}

// Update spawnBoss function
function spawnBoss() {
    console.log('spawnBoss function called');
    bossNumber++;
    console.log('New boss number:', bossNumber);
    
    bossMaxHealth = INITIAL_BOSS_HEALTH + ((bossNumber - 1) * 5);
    bossHealth = bossMaxHealth;

    // Create boss with proper sprite
    boss = this.physics.add.sprite(
        config.width * 0.7,
        config.height/2,
        'boss'  // Using boss sprite now
    );

    // Set the same collision box rules as player (70% of size)
    const bossWidth = boss.width * 0.7;
    const bossHeight = boss.height * 0.7;
    boss.body.setSize(bossWidth, bossHeight);
    boss.body.setOffset(
        (boss.width - bossWidth) / 2,
        (boss.height - bossHeight) / 2
    );

    boss.setScale(1.2);  // Adjust scale as needed for boss.png
    boss.setDepth(1);
    boss.body.setCollideWorldBounds(true);
    boss.body.setImmovable(true);
    
    // Setup UI
    setupBossUI.call(this);

    // Setup boss collision using same logic as player
    setupBossPlayerCollisions.call(this);
}

// New function to handle boss collisions exactly like player
function setupBossPlayerCollisions() {
    this.physics.add.overlap(
        bullets,
        boss,
        (boss, bullet) => {
            if (!boss.getData('isInvulnerable')) {
                bullet.destroy();
                bossHealth--;
                updateBossHealthBar.call(this);

                // Flash effect like player
                boss.setData('isInvulnerable', true);
                let flashCount = 0;
                
                const flashInterval = setInterval(() => {
                    if (boss && boss.active) {
                        boss.setAlpha(boss.alpha === 1 ? 0.2 : 1);
                        flashCount++;
                        
                        if (flashCount >= 6) {
                            clearInterval(flashInterval);
                            if (boss && boss.active) {
                                boss.setAlpha(1);
                                boss.setData('isInvulnerable', false);
                            }
                        }
                    } else {
                        clearInterval(flashInterval);
                    }
                }, 100);

                if (bossHealth <= 0) {
                    // Add score before destroying
                    score += 1000;
                    scoreText.setText('Score: ' + score);
                    
                    // Clear any remaining intervals
                    clearInterval(flashInterval);
                    
                    // Use the cleanup function
                    cleanupBoss.call(this);
                }
            }
        },
        null,
        this
    );
}

// Separate handler for player hits
function handlePlayerHit(player, enemyOrBullet) {
    if (!isInvulnerable) {
        if (deflectors > 0) {
            deflectors--;
            deflectorIndicators[deflectors].destroy();
            flashPlayer();
        } else if (lives > 0) {
            lives--;
            lifeIndicators[lives].destroy();
            flashPlayer();
            
            if (lives <= 0) {
                initiateGameOver.call(this);
            }
        }
        
        if (enemyOrBullet !== boss) {
            enemyOrBullet.destroy();
        }
    }
}

// Add new function to update boss health bar
function updateBossHealthBar() {
    console.log('updateBossHealthBar called - health:', bossHealth);
    if (bossHealthBar && boss) {
        bossHealthBar.clear();
        bossHealthBar.fillStyle(0x666666);
        bossHealthBar.fillRect(config.width/2 - 100, 20, 200, 20);
        bossHealthBar.fillStyle(0xff0000);
        bossHealthBar.fillRect(config.width/2 - 100, 20, (bossHealth/bossMaxHealth) * 200, 20);
    }
}

function shootBossBullet() {
    const bullet = enemyBullets.create(boss.x - 20, boss.y, 'bullet');
    if (bullet) {
        // Calculate angle to player
        const angle = Phaser.Math.Angle.Between(
            boss.x, boss.y,
            player.x, player.y
        );
        
        // Set bullet velocity based on angle
        this.physics.velocityFromRotation(
            angle,
            BOSS_BULLET_SPEED,
            bullet.body.velocity
        );
    }
}

function flashPlayer() {
    isInvulnerable = true;
    let flashCount = 0;
    
    const flashInterval = setInterval(() => {
        player.setAlpha(player.alpha === 1 ? 0.2 : 1);
        flashCount++;
        
        if (flashCount >= 6) { // 3 full flashes (6 toggles)
            clearInterval(flashInterval);
            player.setAlpha(1);
            isInvulnerable = false;
        }
    }, 100);
}

function initiateGameOver() {
    gameOver = true;
    player.setVelocity(0, 0);
    this.input.keyboard.enabled = false;
    
    const gameOverText = this.add.text(config.width/2, config.height/2, 'GAME OVER', {
        fontFamily: 'Arial',
        fontSize: '64px',
        color: '#00ff00'
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setDepth(3);
    
    const finalScoreText = this.add.text(config.width/2, config.height/2 + 70, 'Final Score: ' + score, {
        fontFamily: 'Arial',
        fontSize: '32px',
        color: '#00ff00'
    });
    finalScoreText.setOrigin(0.5);
    finalScoreText.setDepth(3);

    // Check if score is high enough for leaderboard
    checkHighScore.call(this);
}

async function checkHighScore() {
    try {
        if (!supabaseClient) {
            console.log('Supabase not initialized yet');
            return;
        }

        // Get top 10 scores
        const { data: leaderboard, error } = await supabaseClient
            .from('leaderboard')
            .select('score')
            .order('score', { ascending: false })
            .limit(10);

        if (error) throw error;

        // If less than 10 scores or current score is higher than lowest top 10
        if (leaderboard.length < 10 || score > leaderboard[leaderboard.length - 1].score) {
            showLeaderboardForm();
        } else {
            // Show restart text if not a high score
            const restartText = this.add.text(config.width/2, config.height/2 + 120, 'Press R to restart', {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#00ff00'
            });
            restartText.setOrigin(0.5);
            restartText.setDepth(3);
            
            this.input.keyboard.addKey('R').on('down', () => {
                this.scene.restart();
                score = 0;
                lives = 3;
                deflectors = 3;
                gameOver = false;
                isInvulnerable = false;
                this.input.keyboard.enabled = true;
            });
        }
    } catch (error) {
        console.error('Error checking high score:', error);
    }
}

function checkBossSpawn() {
    // Simple score thresholds for boss spawns
    const bossScores = [3000, 7000, 11000, 15000];
    
    // Get the next required score based on current boss number
    const requiredScore = bossScores[bossNumber] || 
        ((bossNumber + 1) * 3000) + (bossNumber * 1000);

    // Debug logging
    console.log('Boss Spawn Check:', {
        currentScore: score,
        requiredScore: requiredScore,
        currentBossNumber: bossNumber,
        isBossActive: boss !== null,
        willSpawn: (!boss && score >= requiredScore)
    });

    // Spawn boss if conditions are met
    if (!boss && score >= requiredScore) {
        console.log('SPAWNING BOSS NOW');
        spawnBoss.call(this);
    }
}

function setupBossUI() {
    // Create health bar
    bossHealthBar = this.add.graphics();
    bossHealthBar.setDepth(3);
    updateBossHealthBar.call(this);

    // Create boss name text
    if (bossNameText) bossNameText.destroy();
    bossNameText = this.add.text(config.width/2, 50, `Boss ${bossNumber}`, {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ff0000'
    });
    bossNameText.setOrigin(0.5);
    bossNameText.setDepth(3);
}

// Add this new function for proper boss cleanup
function cleanupBoss() {
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossNameText) {
        bossNameText.destroy();
        bossNameText = null;
    }
    if (boss) {
        boss.destroy();
        boss = null;
    }
    console.log('Boss cleanup complete, boss state:', {
        bossExists: boss !== null,
        bossHealthBar: bossHealthBar !== null,
        bossNameText: bossNameText !== null
    });
}

// Add this function to show the leaderboard form
function showLeaderboardForm() {
    const form = document.getElementById('leaderboardForm');
    form.style.display = 'block';
}

// Update submitScore function
async function submitScore() {
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;

    if (name.length > 12 || !email.includes('@')) {
        alert('Please enter max valid 12 characters and email address');
        return;
    }

    try {
        // Check if we're authenticated
        const { data: { session }, error: authError } = await supabaseClient.auth.getSession();
        
        if (!session) {
            await signInAnonymously();
        }

        const { data, error } = await supabaseClient
            .from('leaderboard')
            .insert([
                {
                    name: name,
                    email: email,
                    score: score
                }
            ])
            .select();

        if (error) {
            console.error('Insert error:', error);
            throw error;
        }

        console.log('Score submitted successfully:', data);
        await displayLeaderboard();

    } catch (error) {
        console.error('Error submitting score:', error);
        alert('Error submitting score: ' + error.message);
    }
}

// Update displayLeaderboard function
async function displayLeaderboard() {
    try {
        console.log('Fetching leaderboard data...');
        
        // First verify the table exists and we can access it
        const { data: tableInfo, error: tableError } = await supabaseClient
            .from('leaderboard')
            .select('count');

        console.log('Table info:', tableInfo);

        const { data: scores, error } = await supabaseClient
            .from('leaderboard')
            .select('*')
            .order('score', { ascending: false })
            .limit(10);

        console.log('Raw leaderboard response:', { scores, error });

        if (error) {
            console.error('Fetch error:', error);
            throw error;
        }

        const leaderboardBody = document.getElementById('leaderboardBody');
        leaderboardBody.innerHTML = '';

        if (!scores || scores.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="3" style="padding: 15px;">No scores yet!</td>
            `;
            leaderboardBody.appendChild(row);
            console.log('No scores found in leaderboard');
        } else {
            scores.forEach((scoreData, index) => {
                console.log('Processing score:', scoreData);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="padding: 5px 15px;">${index + 1}</td>
                    <td style="padding: 5px 15px;">${scoreData.name}</td>
                    <td style="padding: 5px 15px;">${scoreData.score}</td>
                `;
                leaderboardBody.appendChild(row);
            });
        }

        document.getElementById('leaderboardForm').style.display = 'none';
        document.getElementById('leaderboardDisplay').style.display = 'block';

    } catch (error) {
        console.error('Error displaying leaderboard:', error);
        const leaderboardBody = document.getElementById('leaderboardBody');
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="3" style="padding: 15px; color: red;">
                    Error loading leaderboard: ${error.message}
                </td>
            </tr>
        `;
    }
}

// Add this function to handle game restart
function restartGame() {
    document.getElementById('leaderboardDisplay').style.display = 'none';
    location.reload();
}
 