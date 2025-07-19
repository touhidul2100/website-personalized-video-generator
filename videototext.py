from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips, ImageClip
from pydub import AudioSegment
from gtts import gTTS
import whisper


# Step 1: Extract audio from video
def extract_audio(video_path, output_audio_path):
    video = VideoFileClip(video_path)
    video.audio.write_audiofile(output_audio_path)


# Step 2: Transcribe audio using Whisper
def transcribe_audio(audio_path):
    model = whisper.load_model("base")
    transcription = model.transcribe(audio_path, word_timestamps=True)
    return transcription['segments']


# Step 3: Identify word timestamps for replacement dynamically
def get_word_timestamps(segments, words_to_replace):
    word_locations = []
    normalized_replacements = {k.lower(): v for k, v in words_to_replace.items()}
    for segment in segments:
        if "words" in segment:
            for word_info in segment["words"]:
                word = word_info["word"].strip().lower()
                if word in normalized_replacements:
                    word_locations.append({
                        "word": word_info["word"],
                        "start": word_info["start"],
                        "end": word_info["end"]
                    })
    return word_locations


# Step 4: Replace words in audio
def replace_words_in_audio(audio_path, word_locations, words_to_replace, output_audio_path):
    audio = AudioSegment.from_file(audio_path)
    normalized_replacements = {k.lower(): v for k, v in words_to_replace.items()}
    time_shifts = []

    for i, word_location in enumerate(word_locations):
        start_ms = int(word_location["start"] * 1000)
        end_ms = int(word_location["end"] * 1000)

        # Generate replacement audio using TTS
        replacement_text = normalized_replacements[word_location["word"].strip().lower()]
        tts = gTTS(replacement_text)
        replacement_audio_path = f"replacement_audio_{i}.mp3"
        tts.save(replacement_audio_path)
        replacement_audio = AudioSegment.from_file(replacement_audio_path)

        original_duration = end_ms - start_ms
        replacement_duration = len(replacement_audio)

        time_shift = (replacement_duration - original_duration) / 1000 if replacement_duration > original_duration else 0
        time_shifts.append((word_location["start"], time_shift))

        if replacement_duration > original_duration:
            silence_padding = AudioSegment.silent(duration=(replacement_duration - original_duration))
            replacement_audio = replacement_audio + silence_padding

        audio = audio[:start_ms] + replacement_audio + audio[end_ms:]

    audio.export(output_audio_path, format="wav")
    return time_shifts


# Step 5: Merge audio with video and hold frame only for extra time
def merge_audio_with_video(video_path, new_audio_path, output_video_path, time_shifts):
    original_video = VideoFileClip(video_path)
    new_audio = AudioFileClip(new_audio_path)

    clips = []
    last_end = 0

    for start_time, shift in time_shifts:
        # Add the segment before the replacement word
        if last_end < start_time:
            clips.append(original_video.subclip(last_end, start_time))
        
        # Freeze frame for the replacement word's extra duration
        if shift > 0 and 0 <= start_time < original_video.duration:
            freeze_frame = original_video.get_frame(start_time)
            freeze_clip = (
                ImageClip(freeze_frame, duration=shift)
                .set_fps(original_video.fps)
                .resize(original_video.size)
            )
            clips.append(freeze_clip)

        last_end = start_time

    # Add the remaining video after the last replacement
    if last_end < original_video.duration:
        clips.append(original_video.subclip(last_end, original_video.duration))

    # Concatenate all the video parts
    final_video = concatenate_videoclips(clips).set_audio(new_audio)
    final_video.write_videofile(output_video_path)


# Main script
if __name__ == "__main__":
    video_file = "Generic Video.mp4"  # Replace with your input video file
    audio_file = "extracted_audio.wav"
    modified_audio = "modified_audio.wav"
    output_video = "final_video.mp4"
    
    words_to_replace = {"pool": "Bangladesh", "I": "Kevin"}  # Add more words as needed

    print("Extracting audio from video...")
    extract_audio(video_file, audio_file)

    print("Transcribing audio...")
    segments = transcribe_audio(audio_file)

    print("Identifying words to replace...")
    word_locations = get_word_timestamps(segments, words_to_replace)
    print(f"Words to replace: {word_locations}")

    if not word_locations:
        print("No words found for replacement. Please verify the transcription output.")
    else:
        print("Replacing words in audio...")
        time_shifts = replace_words_in_audio(audio_file, word_locations, words_to_replace, modified_audio)

        print("Merging modified audio with video...")
        merge_audio_with_video(video_file, modified_audio, output_video, time_shifts)

        print(f"Processing complete! Final video saved as {output_video}")
